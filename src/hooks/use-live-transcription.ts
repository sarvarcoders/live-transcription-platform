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

const STALE_SESSION_ERROR_CODES = new Set(["SESSION_HOST_DENIED", "SESSION_NOT_FOUND"]);
const TRANSLATION_ERROR_CODES = new Set([
  "OPENAI_NOT_CONFIGURED",
  "OPENAI_AUTH_INVALID",
  "OPENAI_QUOTA_EXCEEDED",
  "OPENAI_TRANSLATION_FAILED"
]);

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
  const [latencySamples, setLatencySamples] = useState<LatencyMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [role, setRole] = useState<LiveRole | null>(null);
  const [hasBroadcasterToken, setHasBroadcasterToken] = useState(false);
  const latestAcceptedTranslationStartedAtRef = useRef(0);
  const latestSeenTranscriptStartedAtRef = useRef(0);

  const resetTranslationDisplay = useCallback(() => {
    latestAcceptedTranslationStartedAtRef.current = 0;
    latestSeenTranscriptStartedAtRef.current = 0;
    setLastDisplayedTranslation(null);
    setPendingTranslation(null);
    setIsTranslationPending(false);
    setLastFinalTranslation(null);
  }, []);

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
          setLastDisplayedTranslation(measuredSegment.translatedText);
          setPendingTranslation(measuredSegment.translationStatus === "pending" ? measuredSegment : null);
          setIsTranslationPending(measuredSegment.translationStatus === "pending");
          if (measuredSegment.isFinal && measuredSegment.translationStatus === "complete") {
            setLastFinalTranslation(measuredSegment.translatedText);
          }
        }
      } else if (isLatestTranscriptUpdate && (measuredSegment.translationStatus === "pending" || !measuredSegment.isFinal)) {
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
  }, [clearLocalSessionState, stopLocalRecording]);

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
    return () => {
      if (recorderRef.current?.state !== "inactive") {
        recorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.disconnect();
    };
  }, []);

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
      latencySamples,
      error,
      isRecording,
      role,
      hasBroadcasterToken,
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
      latencySamples,
      error,
      isRecording,
      role,
      hasBroadcasterToken,
      hostSession,
      joinSession,
      startRecording,
      stopRecording,
      leaveSession
    ]
  );
}
