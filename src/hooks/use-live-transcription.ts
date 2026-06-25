"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ConnectionState,
  ServerToClientEvents,
  SessionSummary,
  TranscriptSegment,
  LatencyMetrics
} from "@/shared/types";

type TranscriptionSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type LiveRole = "broadcaster" | "viewer";
type StoredSessionCredentials = {
  sessionId: string;
  role: LiveRole;
  reconnectToken: string;
};

const SESSION_STORAGE_KEY = "live-translation-session";
const AUDIO_CHUNK_MS = 75;
const SOCKET_CONNECT_TIMEOUT_MS = 10000;
const SUBTITLE_MIN_DISPLAY_MS = 1000;
const TTS_MIN_CHARS = 8;
const TTS_TARGET_CHARS = 140;
const TTS_MAX_CHARS = 220;

const STALE_SESSION_ERROR_CODES = new Set(["SESSION_HOST_DENIED", "SESSION_NOT_FOUND"]);
const TRANSLATION_ERROR_CODES = new Set([
  "OPENAI_NOT_CONFIGURED",
  "OPENAI_AUTH_INVALID",
  "OPENAI_QUOTA_EXCEEDED",
  "OPENAI_TRANSLATION_FAILED"
]);

type VoiceQueueItem = {
  key: string;
  text: string;
  audio?: HTMLAudioElement;
};

function splitTranslatedTextForTts(text: string) {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  if (normalizedText.length <= TTS_MAX_CHARS) return [normalizedText].filter(Boolean);

  const chunks: string[] = [];
  let remainingText = normalizedText;

  while (remainingText.length > TTS_MAX_CHARS) {
    const searchWindow = remainingText.slice(0, TTS_MAX_CHARS);
    const punctuationCut = Math.max(
      searchWindow.lastIndexOf("."),
      searchWindow.lastIndexOf("!"),
      searchWindow.lastIndexOf("?"),
      searchWindow.lastIndexOf(";"),
      searchWindow.lastIndexOf(",")
    );
    const targetSpaceCut = searchWindow.lastIndexOf(" ", TTS_TARGET_CHARS);
    const maxSpaceCut = searchWindow.lastIndexOf(" ");
    const cutIndex =
      punctuationCut >= 80
        ? punctuationCut + 1
        : targetSpaceCut >= 80
          ? targetSpaceCut
          : maxSpaceCut >= 80
            ? maxSpaceCut
            : TTS_MAX_CHARS;

    chunks.push(remainingText.slice(0, cutIndex).trim());
    remainingText = remainingText.slice(cutIndex).trim();
  }

  if (remainingText) chunks.push(remainingText);
  return chunks.filter((chunk) => chunk.length >= TTS_MIN_CHARS);
}

function getRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function getMicrophoneErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : "Could not start microphone capture.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Microphone permission was denied. Allow microphone access in your browser settings and try again.";
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No microphone was found. Connect a microphone and try again.";
  }

  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "The microphone is already in use by another app or browser tab.";
  }

  if (error.name === "OverconstrainedError") {
    return "The selected microphone does not support the requested audio constraints.";
  }

  return `Could not access microphone: ${error.message || error.name}`;
}

export function useLiveTranscription() {
  const socketRef = useRef<TranscriptionSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const credentialsRef = useRef<StoredSessionCredentials | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [connectionMessage, setConnectionMessage] = useState<string>();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimSegment, setInterimSegment] = useState<TranscriptSegment | null>(null);
  const [lastDisplayedTranslation, setLastDisplayedTranslation] = useState<string | null>(null);
  const [pendingTranslation, setPendingTranslation] = useState<TranscriptSegment | null>(null);
  const [isTranslationPending, setIsTranslationPending] = useState(false);
  const [lastFinalTranslation, setLastFinalTranslation] = useState<string | null>(null);
  const [currentSegmentId, setCurrentSegmentId] = useState<string | null>(null);
  const [lastDisplayUpdateAt, setLastDisplayUpdateAt] = useState(0);
  const [latencySamples, setLatencySamples] = useState<LatencyMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [role, setRole] = useState<LiveRole | null>(null);
  const [hasBroadcasterToken, setHasBroadcasterToken] = useState(false);
  const [isVoiceAvailable, setIsVoiceAvailable] = useState(false);
  const [isVoiceConfigured, setIsVoiceConfigured] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [isVoicePreparing, setIsVoicePreparing] = useState(false);
  const [voiceQueueLength, setVoiceQueueLength] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const latestAcceptedTranslationStartedAtRef = useRef(0);
  const latestSeenTranscriptStartedAtRef = useRef(0);
  const lastDisplayedTranslationRef = useRef<string | null>(null);
  const lastDisplayUpdateAtRef = useRef(0);
  const displayHoldTimerRef = useRef<number | null>(null);
  const queuedDisplayRef = useRef<TranscriptSegment | null>(null);
  const voiceQueueRef = useRef<VoiceQueueItem[]>([]);
  const spokenVoiceKeysRef = useRef<Set<string>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioStopRef = useRef<(() => void) | null>(null);
  const isVoiceProcessingRef = useRef(false);
  const isVoiceEnabledRef = useRef(false);
  const isVoiceAvailableRef = useRef(false);
  const isVoiceConfiguredRef = useRef(false);
  const preloadedVoiceKeysRef = useRef<Set<string>>(new Set());

  const updateVoiceQueueLength = useCallback(() => {
    setVoiceQueueLength(voiceQueueRef.current.length);
  }, []);

  const stopVoice = useCallback(() => {
    console.info("[frontend] stop voice requested");
    voiceQueueRef.current = [];
    updateVoiceQueueLength();
    currentAudioStopRef.current?.();
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    currentAudioStopRef.current = null;
    isVoiceProcessingRef.current = false;
    setIsVoicePreparing(false);
    setIsVoicePlaying(false);
  }, [updateVoiceQueueLength]);

  const createTtsAudio = useCallback((item: VoiceQueueItem) => {
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(item.text)}`);
    audio.preload = "auto";
    return audio;
  }, []);

  const preloadVoiceItem = useCallback(
    (item: VoiceQueueItem) => {
      if (item.audio || preloadedVoiceKeysRef.current.has(item.key)) return;
      item.audio = createTtsAudio(item);
      preloadedVoiceKeysRef.current.add(item.key);
      console.info("[frontend] TTS request started", {
        textLength: item.text.length,
        preloaded: true
      });
      item.audio.load();
    },
    [createTtsAudio]
  );

  const playVoiceItem = useCallback((item: VoiceQueueItem) => {
    return new Promise<void>((resolve, reject) => {
      const audio = item.audio ?? createTtsAudio(item);
      item.audio = audio;
      let sawFirstAudioByte = false;
      let sawFullAudio = false;
      const cleanup = () => {
        audio.oncanplay = null;
        audio.oncanplaythrough = null;
        audio.onended = null;
        audio.onerror = null;
        currentAudioStopRef.current = null;
      };
      currentAudioRef.current = audio;
      currentAudioStopRef.current = () => {
        cleanup();
        resolve();
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        console.error("[frontend] audio play error");
        reject(new Error("Could not play translated voice audio."));
      };
      audio.oncanplay = () => {
        if (sawFirstAudioByte) return;
        sawFirstAudioByte = true;
        setIsVoicePreparing(false);
        console.info("[frontend] first audio byte received", {
          textLength: item.text.length
        });
      };
      audio.oncanplaythrough = () => {
        if (sawFullAudio) return;
        sawFullAudio = true;
        console.info("[frontend] full audio loaded", {
          textLength: item.text.length
        });
      };
      console.info("[frontend] audio playback started", {
        textLength: item.text.length
      });
      audio.play().catch((playError: unknown) => {
        console.error("[frontend] audio play error", {
          message: playError instanceof Error ? playError.message : String(playError)
        });
        reject(playError);
      });
    }).finally(() => {
      currentAudioRef.current = null;
      currentAudioStopRef.current = null;
    });
  }, [createTtsAudio]);

  const processVoiceQueue = useCallback(async () => {
    if (isVoiceProcessingRef.current) return;
    isVoiceProcessingRef.current = true;

    try {
      while (voiceQueueRef.current.length > 0) {
        const nextItem = voiceQueueRef.current.shift();
        updateVoiceQueueLength();
        if (!nextItem) continue;

        setIsVoicePreparing(true);
        setIsVoicePlaying(true);
        if (!nextItem.audio) {
          console.info("[frontend] TTS request started", {
            textLength: nextItem.text.length,
            preloaded: false
          });
          nextItem.audio = createTtsAudio(nextItem);
        }

        const nextQueuedItem = voiceQueueRef.current[0];
        if (nextQueuedItem) preloadVoiceItem(nextQueuedItem);

        await playVoiceItem(nextItem);
      }
    } catch (voicePlaybackError) {
      setVoiceError(voicePlaybackError instanceof Error ? voicePlaybackError.message : "OpenAI voice playback failed");
    } finally {
      isVoiceProcessingRef.current = false;
      setIsVoicePreparing(false);
      setIsVoicePlaying(false);
      updateVoiceQueueLength();
    }
  }, [createTtsAudio, playVoiceItem, preloadVoiceItem, updateVoiceQueueLength]);

  const enqueueVoicePlayback = useCallback(
    (segment: TranscriptSegment) => {
      console.info("[frontend] translated text received", {
        segmentId: segment.id,
        isFinal: segment.isFinal,
        translationStatus: segment.translationStatus,
        hasTranslatedText: Boolean(segment.translatedText),
        textLength: segment.translatedText?.length ?? 0
      });

      if (!segment.translatedText) {
        console.info("[frontend] TTS skipped: no translated text");
        return;
      }

      if (!isVoiceEnabledRef.current) {
        console.info("[frontend] TTS skipped: voice disabled");
        return;
      }

      if (!segment.isFinal && !segment.metrics?.translationCompletedAt) {
        console.info("[frontend] TTS skipped: translation is not stable yet");
        return;
      }

      const chunks = splitTranslatedTextForTts(segment.translatedText);
      if (chunks.length === 0) {
        console.info("[frontend] TTS skipped: no translated text");
        return;
      }

      if (chunks.every((chunk) => chunk.length < TTS_MIN_CHARS)) {
        console.info("[frontend] TTS skipped: tiny translation", {
          textLength: segment.translatedText.length
        });
        return;
      }

      let queuedCount = 0;
      for (const chunk of chunks) {
        const key = chunk.toLocaleLowerCase();
        if (spokenVoiceKeysRef.current.has(key)) {
          console.info("[frontend] TTS skipped: duplicate");
          continue;
        }

        console.info("[frontend] eligible for TTS", {
          segmentId: segment.id,
          isFinal: segment.isFinal,
          textLength: chunk.length
        });
        spokenVoiceKeysRef.current.add(key);
        voiceQueueRef.current.push({ key, text: chunk });
        queuedCount += 1;
      }

      if (queuedCount === 0) return;
      updateVoiceQueueLength();
      console.info("[frontend] audio queued", {
        queueLength: voiceQueueRef.current.length
      });
      void processVoiceQueue();
    },
    [processVoiceQueue, updateVoiceQueueLength]
  );

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => {
      console.info("[frontend] voice enabled", {
        enabled,
        available: isVoiceAvailableRef.current,
        configured: isVoiceConfiguredRef.current
      });
      setVoiceError(null);
      if (!enabled) {
        isVoiceEnabledRef.current = false;
        setIsVoiceEnabled(false);
        stopVoice();
        return;
      }

      if (!isVoiceAvailableRef.current) {
        setVoiceError(isVoiceConfiguredRef.current ? "Voice playback is disabled on this server" : "OpenAI voice playback is not configured");
        return;
      }

      isVoiceEnabledRef.current = true;
      setIsVoiceEnabled(true);
    },
    [stopVoice]
  );

  const clearDisplayHoldTimer = useCallback(() => {
    if (displayHoldTimerRef.current) {
      window.clearTimeout(displayHoldTimerRef.current);
      displayHoldTimerRef.current = null;
    }
  }, []);

  const applyDisplayedTranslation = useCallback((segment: TranscriptSegment) => {
    if (!segment.translatedText) return;
    const now = Date.now();
    lastDisplayedTranslationRef.current = segment.translatedText;
    lastDisplayUpdateAtRef.current = now;
    latestAcceptedTranslationStartedAtRef.current = segment.metrics?.translationStartedAt ?? now;
    setLastDisplayedTranslation(segment.translatedText);
    setCurrentSegmentId(segment.id);
    setLastDisplayUpdateAt(now);
    setPendingTranslation(segment.translationStatus === "pending" ? segment : null);
    setIsTranslationPending(segment.translationStatus === "pending");
    if (segment.isFinal && segment.translationStatus === "complete") {
      setLastFinalTranslation(segment.translatedText);
    }
  }, []);

  const queueDisplayedTranslation = useCallback(
    (segment: TranscriptSegment) => {
      if (!segment.translatedText) return;
      const now = Date.now();
      const isFinalComplete = segment.isFinal && segment.translationStatus === "complete";
      const hasDisplayedTranslation = Boolean(lastDisplayedTranslationRef.current);
      const elapsed = now - lastDisplayUpdateAtRef.current;

      if (isFinalComplete || !hasDisplayedTranslation || elapsed >= SUBTITLE_MIN_DISPLAY_MS) {
        clearDisplayHoldTimer();
        queuedDisplayRef.current = null;
        applyDisplayedTranslation(segment);
        return;
      }

      queuedDisplayRef.current = segment;
      setPendingTranslation(segment);
      setIsTranslationPending(true);
      clearDisplayHoldTimer();
      displayHoldTimerRef.current = window.setTimeout(() => {
        const queuedSegment = queuedDisplayRef.current;
        queuedDisplayRef.current = null;
        displayHoldTimerRef.current = null;
        const queuedTranslationStartedAt = queuedSegment?.metrics?.translationStartedAt ?? 0;
        if (queuedSegment?.translatedText && queuedTranslationStartedAt >= latestAcceptedTranslationStartedAtRef.current) {
          applyDisplayedTranslation(queuedSegment);
        }
      }, SUBTITLE_MIN_DISPLAY_MS - elapsed);
    },
    [applyDisplayedTranslation, clearDisplayHoldTimer]
  );

  const resetTranslationDisplay = useCallback(() => {
    clearDisplayHoldTimer();
    latestAcceptedTranslationStartedAtRef.current = 0;
    latestSeenTranscriptStartedAtRef.current = 0;
    lastDisplayedTranslationRef.current = null;
    lastDisplayUpdateAtRef.current = 0;
    queuedDisplayRef.current = null;
    setLastDisplayedTranslation(null);
    setPendingTranslation(null);
    setIsTranslationPending(false);
    setLastFinalTranslation(null);
    setCurrentSegmentId(null);
    setLastDisplayUpdateAt(0);
  }, [clearDisplayHoldTimer]);

  const stopLocalRecording = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const clearLocalSessionState = useCallback((message?: string) => {
    stopLocalRecording();
    credentialsRef.current = null;
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setSegments([]);
    setInterimSegment(null);
    resetTranslationDisplay();
    setLatencySamples([]);
    setRole(null);
    setHasBroadcasterToken(false);
    setIsRecording(false);
    if (message) setError(message);
  }, [resetTranslationDisplay, stopLocalRecording]);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    setConnectionState("connecting");
    const socket: TranscriptionSocket = io({
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: SOCKET_CONNECT_TIMEOUT_MS
    });

    socket.on("connect", () => {
      setConnectionState("connected");
      setConnectionMessage(undefined);
      const credentials = credentialsRef.current;
      if (credentials) {
        if (credentials.role === "broadcaster") {
          socket.emit("session:host", {
            sessionId: credentials.sessionId,
            reconnectToken: credentials.reconnectToken
          });
        } else {
          socket.emit("session:join", {
            sessionId: credentials.sessionId,
            reconnectToken: credentials.reconnectToken
          });
        }
      }
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
      setIsRecording(false);
      setConnectionMessage("Disconnected from live server.");
    });

    socket.io.on("reconnect_attempt", () => setConnectionState("reconnecting"));
    socket.io.on("reconnect_failed", () => {
      setConnectionState("error");
      setError("Could not reconnect to the live server. Check your network and refresh the page.");
    });

    socket.on("connect_error", (connectError) => {
      setConnectionState("error");
      setError(`Could not connect to the live server: ${connectError.message}`);
    });

    socket.on("connection:state", ({ state, message }) => {
      setConnectionState(state);
      setConnectionMessage(message);
    });

    socket.on("session:ready", ({ session: readySession, role: readyRole, reconnectToken }) => {
      const liveRole = readyRole === "host" ? "broadcaster" : "viewer";
      const credentials: StoredSessionCredentials = {
        sessionId: readySession.id,
        role: liveRole,
        reconnectToken
      };
      credentialsRef.current = credentials;
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(credentials));
      setSession(readySession);
      setRole(liveRole);
      setHasBroadcasterToken(liveRole === "broadcaster" && Boolean(reconnectToken));
      setError(null);
      console.info("[frontend] session ready", {
        sessionId: readySession.id,
        role: liveRole,
        broadcasterTokenAvailable: liveRole === "broadcaster" && Boolean(reconnectToken),
        socketConnected: socket.connected
      });
    });

    socket.on("session:updated", ({ session: updatedSession }) => {
      setSession(updatedSession);
    });

    socket.on("transcript:update", ({ segment }) => {
      const clientReceivedAt = Date.now();
      const metrics: LatencyMetrics = {
        ...segment.metrics,
        clientReceivedAt,
        websocketDeliveryLatencyMs: segment.metrics?.emittedAt ? clientReceivedAt - segment.metrics.emittedAt : undefined,
        totalLatencyMs: segment.metrics?.capturedAt ? clientReceivedAt - segment.metrics.capturedAt : undefined
      };
      const measuredSegment = { ...segment, metrics };
      const translationStartedAt = metrics.translationStartedAt ?? clientReceivedAt;
      const segmentStartedAt = Date.parse(measuredSegment.startedAt) || clientReceivedAt;
      latestSeenTranscriptStartedAtRef.current = Math.max(latestSeenTranscriptStartedAtRef.current, segmentStartedAt);
      const isLatestTranscriptUpdate = segmentStartedAt >= latestSeenTranscriptStartedAtRef.current;

      setLatencySamples((current) => [...current.slice(-119), metrics]);

      if (measuredSegment.translationStatus === "error") {
        if (isLatestTranscriptUpdate) {
          setPendingTranslation(null);
          setIsTranslationPending(false);
        }
      } else if (measuredSegment.translatedText) {
        if (isLatestTranscriptUpdate && translationStartedAt >= latestAcceptedTranslationStartedAtRef.current) {
          latestAcceptedTranslationStartedAtRef.current = translationStartedAt;
          queueDisplayedTranslation(measuredSegment);
          enqueueVoicePlayback(measuredSegment);
        }
      } else if (isLatestTranscriptUpdate && (measuredSegment.translationStatus === "pending" || !measuredSegment.isFinal)) {
        if (isVoiceEnabledRef.current && !measuredSegment.translatedText) {
          console.info("[frontend] TTS skipped: no translated text");
        }
        setPendingTranslation(measuredSegment);
        setIsTranslationPending(true);
      }

      if (!segment.isFinal) {
        setInterimSegment(measuredSegment);
        return;
      }

      setInterimSegment(null);
      setSegments((current) => {
        const existingIndex = current.findIndex((item) => item.id === measuredSegment.id);
        if (existingIndex >= 0) {
          return current.map((item) => (item.id === measuredSegment.id ? measuredSegment : item));
        }
        return [...current.slice(-49), measuredSegment];
      });
    });

    socket.on("server:error", ({ code, message }) => {
      console.error("[frontend] server:error received", {
        eventName: "server:error",
        code,
        message,
        socketConnected: socket.connected
      });
      if (STALE_SESSION_ERROR_CODES.has(code)) {
        clearLocalSessionState(
          "The saved live session is no longer available. The server may have restarted or the session expired. Please create a new session."
        );
      } else if (TRANSLATION_ERROR_CODES.has(code)) {
        setConnectionMessage(message);
      } else {
        setError(message);
        if (
          code === "DEEPGRAM_AUTH_FAILED" ||
          code === "DEEPGRAM_CONFIG_FAILED" ||
          code === "DEEPGRAM_STREAM_ERROR" ||
          code === "DEEPGRAM_START_FAILED" ||
          code === "NO_AUDIO_CHUNKS"
        ) {
          stopLocalRecording();
        }
        console.error("[frontend] connectionState -> error", {
          eventName: "server:error",
          code,
          message
        });
        setConnectionState("error");
      }
    });

    socketRef.current = socket;
    return socket;
  }, [clearLocalSessionState, enqueueVoicePlayback, queueDisplayedTranslation, stopLocalRecording]);

  const waitForConnectedSocket = useCallback(async () => {
    const socket = connect();
    if (socket.connected) return socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out connecting to the live server."));
      }, SOCKET_CONNECT_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
        socket.off("disconnect", onDisconnect);
      }

      function onConnect() {
        cleanup();
        resolve();
      }

      function onConnectError(error: Error) {
        cleanup();
        reject(new Error(`Could not connect to the live server: ${error.message}`));
      }

      function onDisconnect() {
        cleanup();
        reject(new Error("Disconnected before the microphone stream could start."));
      }

      socket.once("connect", onConnect);
      socket.once("connect_error", onConnectError);
      socket.once("disconnect", onDisconnect);
    });

    return socket;
  }, [connect]);

  const hostSession = useCallback(
    (sessionId: string, reconnectToken?: string) => {
      console.info("[frontend] hostSession emit", {
        sessionId,
        broadcasterTokenProvided: Boolean(reconnectToken),
        socketConnected: socketRef.current?.connected ?? false
      });
      setError(null);
      setSegments([]);
      setInterimSegment(null);
      resetTranslationDisplay();
      setRole("broadcaster");
      credentialsRef.current = reconnectToken
        ? { sessionId, role: "broadcaster", reconnectToken }
        : null;
      setHasBroadcasterToken(Boolean(reconnectToken));
      const socket = connect();
      socket.emit("session:host", { sessionId, reconnectToken });
    },
    [connect, resetTranslationDisplay]
  );

  const joinSession = useCallback(
    (sessionId: string) => {
      setError(null);
      setSegments([]);
      setInterimSegment(null);
      resetTranslationDisplay();
      setRole("viewer");
      const existingCredentials = credentialsRef.current;
      const reconnectToken =
        existingCredentials?.sessionId === sessionId && existingCredentials.role === "viewer"
          ? existingCredentials.reconnectToken
          : undefined;
      const socket = connect();
      socket.emit("session:join", { sessionId, reconnectToken });
    },
    [connect, resetTranslationDisplay]
  );

  const startRecording = useCallback(async () => {
    if (!session) {
      setError("Create a transcription session first.");
      return;
    }

    if (role !== "broadcaster") {
      setError("Only the broadcaster can stream microphone audio.");
      return;
    }

    const broadcasterCredentials = credentialsRef.current;
    if (
      !broadcasterCredentials ||
      broadcasterCredentials.role !== "broadcaster" ||
      broadcasterCredentials.sessionId !== session.id
    ) {
      clearLocalSessionState("Broadcaster credentials are missing or stale. Please create a new session.");
      setConnectionState("error");
      return;
    }

    setError(null);

    if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
      setError("Microphone capture requires HTTPS. Open the app over HTTPS or use localhost for development.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone capture.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("This browser does not support MediaRecorder microphone streaming.");
      return;
    }

    try {
      const socket = await waitForConnectedSocket();
      const mimeType = getRecorderMimeType();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      streamRef.current = mediaStream;
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (!event.data.size) return;
        if (!socket.connected) {
          setError("Live server connection was lost. Audio chunks are not being sent.");
          return;
        }

        const audio = await event.data.arrayBuffer();
        const sentAt = Date.now();
        socket.emit("audio:chunk", {
          sessionId: session.id,
          audio,
          capturedAt: sentAt - AUDIO_CHUNK_MS,
          sentAt
        });
      };

      recorder.onerror = (event) => {
        const recorderError = event instanceof ErrorEvent ? event.error : undefined;
        setError(recorderError instanceof Error ? recorderError.message : "Microphone recorder failed.");
        setIsRecording(false);
      };

      recorder.onstart = () => {
        setIsRecording(true);
        setConnectionMessage("Microphone is streaming.");
      };

      recorder.onstop = () => {
        setIsRecording(false);
      };

      socket.emit("audio:start", { sessionId: session.id, mimeType: mimeType || "audio/webm" });
      recorder.start(AUDIO_CHUNK_MS);
    } catch (recordingError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setError(getMicrophoneErrorMessage(recordingError));
    }
  }, [clearLocalSessionState, role, session, waitForConnectedSocket]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.requestData();
      recorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (session) socketRef.current?.emit("audio:stop", { sessionId: session.id });
    setIsRecording(false);
    setConnectionMessage(session ? "Session ready. Microphone is stopped." : undefined);
  }, [session]);

  const leaveSession = useCallback(() => {
    stopRecording();
    if (session) socketRef.current?.emit("session:leave", { sessionId: session.id });
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSession(null);
    setSegments([]);
    setInterimSegment(null);
    resetTranslationDisplay();
    setLatencySamples([]);
    setRole(null);
    setHasBroadcasterToken(false);
    credentialsRef.current = null;
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setConnectionState("idle");
  }, [resetTranslationDisplay, session, stopRecording]);

  useEffect(() => {
    const storedCredentials = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedCredentials) {
      try {
        const credentials = JSON.parse(storedCredentials) as StoredSessionCredentials;
        credentialsRef.current = credentials;
        setRole(credentials.role);
        setHasBroadcasterToken(credentials.role === "broadcaster" && Boolean(credentials.reconnectToken));
        connect();
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, [connect]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/tts")
      .then((response) => response.json())
      .then((payload: { enabled?: boolean; configured?: boolean }) => {
        if (!isMounted) return;
        isVoiceConfiguredRef.current = Boolean(payload.configured);
        isVoiceAvailableRef.current = Boolean(payload.enabled && payload.configured);
        setIsVoiceConfigured(Boolean(payload.configured));
        setIsVoiceAvailable(Boolean(payload.enabled && payload.configured));
      })
      .catch(() => {
        if (isMounted) {
          isVoiceConfiguredRef.current = false;
          isVoiceAvailableRef.current = false;
          setIsVoiceConfigured(false);
          setIsVoiceAvailable(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state !== "inactive") {
        recorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.disconnect();
      clearDisplayHoldTimer();
      stopVoice();
    };
  }, [clearDisplayHoldTimer, stopVoice]);

  return useMemo(
    () => ({
      connectionState,
      connectionMessage,
      session,
      segments,
      interimSegment,
      lastDisplayedTranslation,
      pendingTranslation,
      isTranslationPending,
      lastFinalTranslation,
      currentSegmentId,
      lastDisplayUpdateAt,
      latencySamples,
      error,
      isRecording,
      role,
      hasBroadcasterToken,
      isVoiceAvailable,
      isVoiceConfigured,
      isVoiceEnabled,
      isVoicePlaying,
      isVoicePreparing,
      voiceQueueLength,
      voiceError,
      setVoiceEnabled,
      stopVoice,
      hostSession,
      joinSession,
      startRecording,
      stopRecording,
      leaveSession,
      clearError: () => setError(null)
    }),
    [
      connectionState,
      connectionMessage,
      session,
      segments,
      interimSegment,
      lastDisplayedTranslation,
      pendingTranslation,
      isTranslationPending,
      lastFinalTranslation,
      currentSegmentId,
      lastDisplayUpdateAt,
      latencySamples,
      error,
      isRecording,
      role,
      hasBroadcasterToken,
      isVoiceAvailable,
      isVoiceConfigured,
      isVoiceEnabled,
      isVoicePlaying,
      isVoicePreparing,
      voiceQueueLength,
      voiceError,
      setVoiceEnabled,
      stopVoice,
      hostSession,
      joinSession,
      startRecording,
      stopRecording,
      leaveSession
    ]
  );
}
