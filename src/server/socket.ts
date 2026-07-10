import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  ActiveSttProvider,
  ClientToServerEvents,
  InterServerEvents,
  LatencyMetrics,
  ServerToClientEvents,
  SocketData,
  SttProvider,
  TranscriptSegment
} from "@/shared/types";
import { sessionStore } from "./sessions";
import { getServerEnv } from "./env";
import { debugInfo } from "./logger";
import { canFallbackToDeepgram, classifySttError, createSttStream, selectSttProvider, type SttStream, type SttTranscript } from "./stt";
import { classifyTranslationError, normalizeTranscriptText, streamTranslateTranscript } from "./translator";

type TranslationServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TranslationSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type InterimTranslationState = {
  requestId: number;
  text: string;
  lastRequestedAt: number;
  lastRawText?: string;
  repeatedCount: number;
  stabilityTimer?: NodeJS.Timeout;
};

const activeStreams = new Map<string, SttStream>();
const audioChunkStatsBySession = new Map<string, { count: number; totalBytes: number; lastChunkAt?: number }>();
const noAudioTimersBySession = new Map<string, NodeJS.Timeout>();
const lastAudioTimingBySession = new Map<string, { capturedAt: number; sentAt: number; audioReceivedAt: number }>();
const interimTranslationStateBySession = new Map<string, InterimTranslationState>();
const finalTranslationTimersBySession = new Map<string, Set<NodeJS.Timeout>>();

function roomName(sessionId: string) {
  return `session:${sessionId}`;
}

function emitError(socket: TranslationSocket, code: string, message: string) {
  socket.emit("server:error", { code, message });
}

function toAudioBuffer(audio: ArrayBuffer | Buffer | Uint8Array) {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof ArrayBuffer) return Buffer.from(new Uint8Array(audio));
  return Buffer.from(audio);
}

function emitSegment(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  io.to(roomName(sessionId)).emit("transcript:update", {
    segment: {
      ...segment,
      metrics: {
        ...segment.metrics,
        emittedAt: Date.now()
      }
    }
  });
}

function clearNoAudioTimer(sessionId: string) {
  const timer = noAudioTimersBySession.get(sessionId);
  if (timer) clearTimeout(timer);
  noAudioTimersBySession.delete(sessionId);
}

function clearInterimStabilityTimer(sessionId: string) {
  const state = interimTranslationStateBySession.get(sessionId);
  if (state?.stabilityTimer) clearTimeout(state.stabilityTimer);
  if (state) {
    interimTranslationStateBySession.set(sessionId, {
      ...state,
      stabilityTimer: undefined
    });
  }
}

function resetAudioState(sessionId: string) {
  activeStreams.delete(sessionId);
  audioChunkStatsBySession.delete(sessionId);
  clearNoAudioTimer(sessionId);
  lastAudioTimingBySession.delete(sessionId);
  clearInterimStabilityTimer(sessionId);
  interimTranslationStateBySession.delete(sessionId);
}

function baseMetrics(sessionId: string, deepgramReceivedAt: number): LatencyMetrics {
  const audioTiming = lastAudioTimingBySession.get(sessionId);
  return {
    capturedAt: audioTiming?.capturedAt,
    audioReceivedAt: audioTiming?.audioReceivedAt,
    deepgramReceivedAt,
    speechCaptureLatencyMs:
      audioTiming?.capturedAt && audioTiming.audioReceivedAt ? audioTiming.audioReceivedAt - audioTiming.capturedAt : undefined,
    deepgramLatencyMs: audioTiming?.audioReceivedAt ? deepgramReceivedAt - audioTiming.audioReceivedAt : undefined
  };
}

function getPreviousTranslationContext(sessionId: string, currentSegmentId: string) {
  const previous = sessionStore
    .getTranscript(sessionId)
    .filter((segment) => segment.id !== currentSegmentId && segment.isFinal && segment.translatedText)
    .at(-1);

  return previous
    ? {
        sourceContext: previous.text,
        translationContext: previous.translatedText
      }
    : {};
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function segmentTranscriptPhrase(text: string, maxChars: number) {
  const normalizedText = normalizeTranscriptText(text);
  if (normalizedText.length <= maxChars && countWords(normalizedText) <= 12) return normalizedText;

  const punctuationMatches = [...normalizedText.matchAll(/[.!?;:,]/g)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 20 && index < maxChars);
  const punctuationCut = punctuationMatches.at(-1);
  if (punctuationCut) return normalizedText.slice(0, punctuationCut + 1).trim();

  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (words.length > 12) {
    const firstTwelveWords = words.slice(0, 12).join(" ");
    if (firstTwelveWords.length <= maxChars) return firstTwelveWords;
  }

  const safeCut = normalizedText.lastIndexOf(" ", maxChars);
  if (safeCut >= 20) return normalizedText.slice(0, safeCut).trim();
  return normalizedText.slice(0, maxChars).trim();
}

function requestInterimTranslation(io: TranslationServer, sessionId: string, segment: TranscriptSegment, candidateText: string) {
  const env = getServerEnv();
  if (!env.INTERIM_TRANSLATION_ENABLED) return;

  const normalizedText = segmentTranscriptPhrase(candidateText, env.SUBTITLE_MAX_CHARS);
  if (normalizedText.length < env.INTERIM_TRANSLATION_MIN_CHARS) return;

  const currentState = interimTranslationStateBySession.get(sessionId);
  const now = Date.now();
  if (currentState?.text === normalizedText) return;
  if (currentState && now - currentState.lastRequestedAt < env.INTERIM_TRANSLATION_MIN_INTERVAL_MS) {
    clearInterimStabilityTimer(sessionId);
    const delay = env.INTERIM_TRANSLATION_MIN_INTERVAL_MS - (now - currentState.lastRequestedAt);
    const timer = setTimeout(() => requestInterimTranslation(io, sessionId, segment, normalizedText), delay);
    interimTranslationStateBySession.set(sessionId, {
      ...currentState,
      stabilityTimer: timer
    });
    return;
  }

  const requestId = (currentState?.requestId ?? 0) + 1;
  interimTranslationStateBySession.set(sessionId, {
    ...currentState,
    requestId,
    text: normalizedText,
    lastRequestedAt: now,
    repeatedCount: currentState?.repeatedCount ?? 0,
    stabilityTimer: undefined
  });

  const translationStartedAt = Date.now();
  let firstTokenAt: number | undefined;

  streamTranslateTranscript({
    text: normalizedText,
    sourceLanguage: segment.sourceLanguage,
    targetLanguage: segment.targetLanguage,
    ...getPreviousTranslationContext(sessionId, segment.id),
    onFirstToken: () => {
      firstTokenAt = Date.now();
    },
    onToken: (partialText) => {
      const latestState = interimTranslationStateBySession.get(sessionId);
      if (latestState?.requestId !== requestId || latestState.text !== normalizedText) return;

      emitSegment(io, sessionId, {
        ...segment,
        text: normalizedText,
        translatedText: partialText,
        translationStatus: "pending",
        metrics: {
          ...segment.metrics,
          translationStartedAt,
          firstTokenAt,
          openaiFirstTokenLatencyMs: firstTokenAt ? firstTokenAt - translationStartedAt : undefined
        }
      });
    }
  })
    .then((translatedText) => {
      const latestState = interimTranslationStateBySession.get(sessionId);
      if (latestState?.requestId !== requestId || latestState.text !== normalizedText) return;

      const translationCompletedAt = Date.now();
      emitSegment(io, sessionId, {
        ...segment,
        text: normalizedText,
        translatedText,
        translationStatus: "pending",
        metrics: {
          ...segment.metrics,
          translationStartedAt,
          firstTokenAt,
          translationCompletedAt,
          openaiFirstTokenLatencyMs: firstTokenAt ? firstTokenAt - translationStartedAt : undefined,
          openaiTotalLatencyMs: translationCompletedAt - translationStartedAt
        }
      });
    })
    .catch((error: unknown) => {
      const latestState = interimTranslationStateBySession.get(sessionId);
      if (latestState?.requestId !== requestId || latestState.text !== normalizedText) return;

      const classifiedError = classifyTranslationError(error);
      console.warn("[socket] interim translation failed", {
        sessionId,
        code: classifiedError.code,
        message: classifiedError.message
      });
      emitSegment(io, sessionId, {
        ...segment,
        translationStatus: "error",
        metrics: {
          ...segment.metrics,
          translationStartedAt
        }
      });
      io.to(roomName(sessionId)).emit("server:error", {
        code: classifiedError.code,
        message: classifiedError.message
      });
    });
}

function scheduleInterimTranslation(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  const env = getServerEnv();
  if (!env.INTERIM_TRANSLATION_ENABLED) return;

  const rawText = normalizeTranscriptText(segment.text);
  if (rawText.length < env.INTERIM_TRANSLATION_MIN_CHARS) return;

  const currentState = interimTranslationStateBySession.get(sessionId);
  const repeatedCount = currentState?.lastRawText === rawText ? currentState.repeatedCount + 1 : 1;
  const nextState: InterimTranslationState = {
    requestId: currentState?.requestId ?? 0,
    text: currentState?.text ?? "",
    lastRequestedAt: currentState?.lastRequestedAt ?? 0,
    lastRawText: rawText,
    repeatedCount
  };

  if (currentState?.stabilityTimer) clearTimeout(currentState.stabilityTimer);

  if (repeatedCount >= 2) {
    interimTranslationStateBySession.set(sessionId, nextState);
    requestInterimTranslation(io, sessionId, segment, rawText);
    return;
  }

  const stabilityTimer = setTimeout(() => {
    const latestState = interimTranslationStateBySession.get(sessionId);
    if (latestState?.lastRawText !== rawText) return;
    requestInterimTranslation(io, sessionId, segment, rawText);
  }, env.INTERIM_TRANSLATION_STABILITY_MS);

  interimTranslationStateBySession.set(sessionId, {
    ...nextState,
    stabilityTimer
  });
}

function translateFinalSegment(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  const currentState = interimTranslationStateBySession.get(sessionId);
  if (currentState?.stabilityTimer) clearTimeout(currentState.stabilityTimer);
  interimTranslationStateBySession.set(sessionId, {
    ...currentState,
    requestId: (currentState?.requestId ?? 0) + 1,
    text: normalizeTranscriptText(segment.text),
    lastRequestedAt: 0,
    repeatedCount: currentState?.repeatedCount ?? 0,
    stabilityTimer: undefined
  });

  const translationStartedAt = Date.now();
  let firstTokenAt: number | undefined;

  streamTranslateTranscript({
    text: segment.text,
    sourceLanguage: segment.sourceLanguage,
    targetLanguage: segment.targetLanguage,
    ...getPreviousTranslationContext(sessionId, segment.id),
    onFirstToken: () => {
      firstTokenAt = Date.now();
    },
    onToken: (partialText) => {
      emitSegment(io, sessionId, {
        ...segment,
        translatedText: partialText,
        translationStatus: "pending",
        metrics: {
          ...segment.metrics,
          translationStartedAt,
          firstTokenAt,
          openaiFirstTokenLatencyMs: firstTokenAt ? firstTokenAt - translationStartedAt : undefined
        }
      });
    }
  })
    .then((translatedText) => {
      const translationCompletedAt = Date.now();
      const translatedSegment: TranscriptSegment = {
        ...segment,
        translatedText,
        translationStatus: "complete",
        metrics: {
          ...segment.metrics,
          translationStartedAt,
          firstTokenAt,
          translationCompletedAt,
          openaiFirstTokenLatencyMs: firstTokenAt ? firstTokenAt - translationStartedAt : undefined,
          openaiTotalLatencyMs: translationCompletedAt - translationStartedAt
        }
      };
      sessionStore.addTranscript(sessionId, translatedSegment);
      emitSegment(io, sessionId, translatedSegment);
    })
    .catch((error: unknown) => {
      const classifiedError = classifyTranslationError(error);
      const failedSegment: TranscriptSegment = {
        ...segment,
        translationStatus: "error",
        metrics: {
          ...segment.metrics,
          translationStartedAt
        }
      };
      console.warn("[socket] translation failed", {
        sessionId,
        code: classifiedError.code,
        message: classifiedError.message
      });
      sessionStore.addTranscript(sessionId, failedSegment);
      emitSegment(io, sessionId, failedSegment);
      io.to(roomName(sessionId)).emit("server:error", {
        code: classifiedError.code,
        message: classifiedError.message
      });
    });
}

function scheduleFinalTranslation(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  const debounceMs = getServerEnv().FINAL_TRANSLATION_DEBOUNCE_MS;
  const run = () => translateFinalSegment(io, sessionId, segment);

  if (debounceMs <= 0) {
    run();
    return;
  }

  const timer = setTimeout(() => {
    const timersForSession = finalTranslationTimersBySession.get(sessionId);
    timersForSession?.delete(timer);
    if (timersForSession?.size === 0) finalTranslationTimersBySession.delete(sessionId);
    run();
  }, debounceMs);

  const timers = finalTranslationTimersBySession.get(sessionId) ?? new Set<NodeJS.Timeout>();
  timers.add(timer);
  finalTranslationTimersBySession.set(sessionId, timers);
}

function getProviderLabel(provider: ActiveSttProvider) {
  if (provider === "uzbekvoice") return "UzbekVoice";
  if (provider === "google") return "Google";
  if (provider === "openai") return "OpenAI";
  return "Deepgram";
}

function publishSttProvider(
  io: TranslationServer,
  sessionId: string,
  provider: ActiveSttProvider,
  requestedProvider: SttProvider,
  message?: string
) {
  const session = sessionStore.setActiveSttProvider(sessionId, provider);
  const payload = { sessionId, provider, requestedProvider, message };
  io.to(roomName(sessionId)).emit("stt:provider", payload);
  if (session) io.to(roomName(sessionId)).emit("session:updated", { session });
}

export function registerSocketHandlers(io: TranslationServer) {
  io.on("connection", (socket) => {
    console.info("[socket] connected", { socketId: socket.id });
    socket.emit("connection:state", { state: "connected" });

    socket.on("session:host", ({ sessionId, reconnectToken }) => {
      console.info("[socket] session:host", {
        socketId: socket.id,
        sessionId,
        reconnectTokenProvided: Boolean(reconnectToken)
      });
      const result = sessionStore.setHost(sessionId, socket.id, reconnectToken);
      if (!result) {
        emitError(socket, "SESSION_HOST_DENIED", "Session was not found, expired, or the broadcaster token is invalid.");
        return;
      }

      const canonicalSessionId = result.session.id;
      socket.data.sessionId = canonicalSessionId;
      socket.data.role = "host";
      socket.join(roomName(canonicalSessionId));
      socket.emit("session:ready", { session: result.session, role: "host", reconnectToken: result.reconnectToken });
      io.to(roomName(canonicalSessionId)).emit("session:updated", { session: result.session });
    });

    socket.on("session:join", ({ sessionId, reconnectToken }) => {
      console.info("[socket] session:join", {
        socketId: socket.id,
        sessionId,
        reconnectTokenProvided: Boolean(reconnectToken)
      });
      const result = sessionStore.addViewer(sessionId, socket.id, reconnectToken);
      if (!result) {
        emitError(socket, "SESSION_NOT_FOUND", "Session was not found or has expired.");
        return;
      }

      const canonicalSessionId = result.session.id;
      socket.data.sessionId = canonicalSessionId;
      socket.data.role = "viewer";
      socket.join(roomName(canonicalSessionId));
      socket.emit("session:ready", { session: result.session, role: "viewer", reconnectToken: result.reconnectToken });

      for (const segment of sessionStore.getTranscript(canonicalSessionId)) {
        socket.emit("transcript:update", { segment });
      }

      io.to(roomName(canonicalSessionId)).emit("session:updated", { session: result.session });
    });

    socket.on("audio:start", ({ sessionId, mimeType }) => {
      console.info("[socket] audio:start", { socketId: socket.id, sessionId, mimeType });
      const liveSession = sessionStore.getLive(sessionId);
      if (!liveSession) {
        emitError(socket, "SESSION_NOT_FOUND", "Session was not found.");
        return;
      }

      if (liveSession.hostSocketId !== socket.id) {
        emitError(socket, "NOT_HOST", "Only the session host can stream microphone audio.");
        return;
      }

      activeStreams.get(sessionId)?.stop();
      resetAudioState(sessionId);

      const env = getServerEnv();
      const requestedProvider = liveSession.sttProvider ?? getServerEnv().STT_PROVIDER;
      const selection = selectSttProvider(liveSession.sourceLanguage, requestedProvider);
      const routingReason =
        selection.fallbackReason ??
        (liveSession.sourceLanguage === "uz" && selection.provider === "openai"
          ? "Auto routing selected OpenAI STT for Uzbek speech"
          : (liveSession.sourceLanguage === "en" || liveSession.sourceLanguage === "ru") && selection.provider === "deepgram"
            ? `Auto routing selected Deepgram for ${liveSession.sourceLanguage} speech`
            : "Manual STT provider selection");
      console.info("[stt] routing decision", {
        sessionId,
        sourceLanguage: liveSession.sourceLanguage,
        requestedProvider: selection.requestedProvider,
        resolvedProvider: selection.provider,
        routingReason,
        openaiSttEnabled: env.OPENAI_STT_ENABLED,
        deepgramUsedForEnglishRussian:
          selection.provider === "deepgram" && (liveSession.sourceLanguage === "en" || liveSession.sourceLanguage === "ru")
      });
      let fallbackUsed = false;

      const handleTranscript = (transcript: SttTranscript) => {
        const sttReceivedAt = Date.now();
        debugInfo("[socket] stt transcript received", {
          sessionId,
          provider: transcript.provider,
          isFinal: transcript.isFinal,
          textLength: transcript.text.length,
          confidence: transcript.confidence
        });

        const segment: TranscriptSegment = {
          id: transcript.isFinal ? randomUUID() : `interim:${sessionId}`,
          sessionId,
          text: transcript.text,
          sourceLanguage: liveSession.sourceLanguage,
          targetLanguage: liveSession.targetLanguage,
          isFinal: transcript.isFinal,
          sttProvider: transcript.provider,
          translationStatus: transcript.isFinal ? "pending" : undefined,
          confidence: transcript.confidence,
          startedAt: new Date().toISOString(),
          completedAt: transcript.isFinal ? new Date().toISOString() : undefined,
          metrics: baseMetrics(sessionId, sttReceivedAt)
        };

        if (transcript.isFinal) {
          console.info("[stt] final transcript received", {
            sessionId,
            provider: transcript.provider,
            textLength: transcript.text.length
          });
          sessionStore.addTranscript(sessionId, segment);
          scheduleFinalTranslation(io, sessionId, segment);
        } else {
          debugInfo("[stt] interim transcript received", {
            sessionId,
            provider: transcript.provider,
            textLength: transcript.text.length
          });
          scheduleInterimTranslation(io, sessionId, segment);
        }

        emitSegment(io, sessionId, segment);
      };

      const startProviderStream = (provider: ActiveSttProvider, message?: string) => {
        const stream = createSttStream(provider, {
          sessionId,
          sourceLanguage: liveSession.sourceLanguage,
          mimeType,
          onTranscript: handleTranscript,
          onError: (error) => {
            const classifiedError = classifySttError(provider, error);
            console.warn("[stt] provider error", {
              sessionId,
              provider,
              code: classifiedError.code,
              message: classifiedError.message
            });

            if (canFallbackToDeepgram(provider, liveSession.sourceLanguage, selection.requestedProvider) && !fallbackUsed) {
              fallbackUsed = true;
              activeStreams.get(sessionId)?.stop();
              activeStreams.delete(sessionId);
              try {
                const fallbackMessage = `${classifiedError.message} STT provider switched to Deepgram`;
                startProviderStream("deepgram", fallbackMessage);
                socket.emit("connection:state", { state: "connected", message: fallbackMessage });
                return;
              } catch (fallbackError) {
                const fallbackClassification = classifySttError("deepgram", fallbackError);
                io.to(roomName(sessionId)).emit("server:error", {
                  code: fallbackClassification.code,
                  message: fallbackClassification.message
                });
              }
            }

            const session = sessionStore.markError(sessionId);
            activeStreams.get(sessionId)?.stop();
            resetAudioState(sessionId);
            io.to(roomName(sessionId)).emit("server:error", {
              code: classifiedError.code,
              message: classifiedError.message
            });
            if (session) io.to(roomName(sessionId)).emit("session:updated", { session });
          },
          onClose: () => {
            debugInfo("[socket] stt stream closed", {
              sessionId,
              provider,
              audioStats: audioChunkStatsBySession.get(sessionId)
            });
            activeStreams.delete(sessionId);
          }
        });

        stream.start();
        activeStreams.set(sessionId, stream);
        publishSttProvider(io, sessionId, provider, selection.requestedProvider, message);
        console.info("[stt] selected provider", {
          sessionId,
          requestedProvider: selection.requestedProvider,
          provider,
          sourceLanguage: liveSession.sourceLanguage,
          routingReason: message ?? selection.fallbackReason ?? routingReason
        });
      };

      const startAudioMonitoring = () => {
        audioChunkStatsBySession.set(sessionId, { count: 0, totalBytes: 0 });
        clearNoAudioTimer(sessionId);
        noAudioTimersBySession.set(
          sessionId,
          setTimeout(() => {
            const stats = audioChunkStatsBySession.get(sessionId);
            if (!stats || stats.count === 0) {
              console.warn("[socket] no audio chunks received after audio:start", { sessionId, socketId: socket.id });
              emitError(socket, "NO_AUDIO_CHUNKS", "Microphone started but no audio chunks were sent");
            }
          }, 3000)
        );
      };

      try {
        startProviderStream(selection.provider, selection.fallbackReason);
        startAudioMonitoring();
        socket.emit("connection:state", { state: "connected", message: `${getProviderLabel(selection.provider)} STT stream started.` });
      } catch (error) {
        const classifiedError = classifySttError(selection.provider, error);
        if (canFallbackToDeepgram(selection.provider, liveSession.sourceLanguage, selection.requestedProvider)) {
          try {
            fallbackUsed = true;
            const fallbackMessage = `${classifiedError.message} STT provider switched to Deepgram`;
            startProviderStream("deepgram", fallbackMessage);
            startAudioMonitoring();
            socket.emit("connection:state", { state: "connected", message: fallbackMessage });
            return;
          } catch (fallbackError) {
            const fallbackClassification = classifySttError("deepgram", fallbackError);
            emitError(socket, fallbackClassification.code, fallbackClassification.message);
            return;
          }
        }
        emitError(socket, classifiedError.code, classifiedError.message);
      }
    });

    socket.on("audio:chunk", ({ sessionId, audio, capturedAt, sentAt }) => {
      const stream = activeStreams.get(sessionId);
      if (!stream) return;
      const audioBuffer = toAudioBuffer(audio);
      const currentStats = audioChunkStatsBySession.get(sessionId) ?? { count: 0, totalBytes: 0 };
      const nextStats = {
        count: currentStats.count + 1,
        totalBytes: currentStats.totalBytes + audioBuffer.byteLength,
        lastChunkAt: Date.now()
      };
      audioChunkStatsBySession.set(sessionId, nextStats);
      clearNoAudioTimer(sessionId);
      if (nextStats.count <= 5 || nextStats.count % 50 === 0) {
        debugInfo("[socket] audio chunk received", {
          sessionId,
          count: nextStats.count,
          byteLength: audioBuffer.byteLength,
          totalBytes: nextStats.totalBytes
        });
      }
      lastAudioTimingBySession.set(sessionId, {
        capturedAt,
        sentAt,
        audioReceivedAt: Date.now()
      });
      stream.send(audioBuffer);
    });

    socket.on("audio:stop", ({ sessionId }) => {
      activeStreams.get(sessionId)?.stop();
      resetAudioState(sessionId);
    });

    socket.on("session:leave", ({ sessionId }) => {
      socket.leave(roomName(sessionId));
      const changedSessions = sessionStore.leaveSocket(socket.id);
      for (const session of changedSessions) {
        io.to(roomName(session.id)).emit("session:updated", { session });
      }
    });

    socket.on("disconnect", () => {
      console.info("[socket] disconnected", {
        socketId: socket.id,
        sessionId: socket.data.sessionId,
        role: socket.data.role
      });
      const sessionId = socket.data.sessionId;
      if (socket.data.role === "host" && sessionId) {
        activeStreams.get(sessionId)?.stop();
        resetAudioState(sessionId);
      }

      const changedSessions = sessionStore.detachSocket(socket.id);
      for (const session of changedSessions) {
        io.to(roomName(session.id)).emit("session:updated", { session });
      }
    });
  });
}
