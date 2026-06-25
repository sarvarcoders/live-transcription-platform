import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  LatencyMetrics,
  ServerToClientEvents,
  SocketData,
  TranscriptSegment
} from "@/shared/types";
import { sessionStore } from "./sessions";
import { DeepgramStream } from "./deepgram";
import { getServerEnv } from "./env";
import { classifyTranslationError, normalizeTranscriptText, streamTranslateTranscript } from "./translator";

type TranslationServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TranslationSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const activeStreams = new Map<string, DeepgramStream>();
const audioChunkStatsBySession = new Map<string, { count: number; totalBytes: number; lastChunkAt?: number }>();
const noAudioTimersBySession = new Map<string, NodeJS.Timeout>();
const lastAudioTimingBySession = new Map<string, { capturedAt: number; sentAt: number; audioReceivedAt: number }>();
const interimTranslationStateBySession = new Map<string, { requestId: number; text: string; lastRequestedAt: number }>();
const finalTranslationTimersBySession = new Map<string, Set<NodeJS.Timeout>>();

function roomName(sessionId: string) {
  return `session:${sessionId}`;
}

function emitError(socket: TranslationSocket, code: string, message: string) {
  socket.emit("server:error", { code, message });
}

function classifyDeepgramError(error: Error) {
  const message = error.message.toLowerCase();
  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("api key") ||
    message.includes("auth")
  ) {
    return {
      code: "DEEPGRAM_AUTH_FAILED",
      message: "Deepgram API key is invalid or unauthorized"
    };
  }

  if (
    message.includes("400") ||
    message.includes("model") ||
    message.includes("language") ||
    message.includes("unsupported") ||
    message.includes("invalid")
  ) {
    return {
      code: "DEEPGRAM_CONFIG_FAILED",
      message: "Deepgram model or language configuration failed"
    };
  }

  return {
    code: "DEEPGRAM_STREAM_ERROR",
    message: `Deepgram connection failed: ${error.message}`
  };
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

function resetAudioState(sessionId: string) {
  activeStreams.delete(sessionId);
  audioChunkStatsBySession.delete(sessionId);
  clearNoAudioTimer(sessionId);
  lastAudioTimingBySession.delete(sessionId);
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

function translateInterimSegment(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  const env = getServerEnv();
  if (!env.INTERIM_TRANSLATION_ENABLED) return;

  const normalizedText = normalizeTranscriptText(segment.text);
  if (normalizedText.length < env.INTERIM_TRANSLATION_MIN_CHARS) return;

  const currentState = interimTranslationStateBySession.get(sessionId);
  const now = Date.now();
  if (currentState?.text === normalizedText) return;
  if (currentState && now - currentState.lastRequestedAt < env.INTERIM_TRANSLATION_MIN_INTERVAL_MS) return;

  const requestId = (currentState?.requestId ?? 0) + 1;
  interimTranslationStateBySession.set(sessionId, {
    requestId,
    text: normalizedText,
    lastRequestedAt: now
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
        translatedText: classifiedError.message,
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

function translateFinalSegment(io: TranslationServer, sessionId: string, segment: TranscriptSegment) {
  const currentState = interimTranslationStateBySession.get(sessionId);
  interimTranslationStateBySession.set(sessionId, {
    requestId: (currentState?.requestId ?? 0) + 1,
    text: normalizeTranscriptText(segment.text),
    lastRequestedAt: 0
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
        translatedText: classifiedError.message,
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

      const stream = new DeepgramStream({
        sessionId,
        sourceLanguage: liveSession.sourceLanguage,
        mimeType,
        onTranscript: (transcript) => {
          const deepgramReceivedAt = Date.now();
          console.info("[socket] transcript received", {
            sessionId,
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
            translationStatus: transcript.isFinal ? "pending" : undefined,
            confidence: transcript.confidence,
            startedAt: new Date().toISOString(),
            completedAt: transcript.isFinal ? new Date().toISOString() : undefined,
            metrics: baseMetrics(sessionId, deepgramReceivedAt)
          };

          if (transcript.isFinal) {
            sessionStore.addTranscript(sessionId, segment);
            scheduleFinalTranslation(io, sessionId, segment);
          } else {
            translateInterimSegment(io, sessionId, segment);
          }

          emitSegment(io, sessionId, segment);
        },
        onError: (error) => {
          const session = sessionStore.markError(sessionId);
          const classifiedError = classifyDeepgramError(error);
          activeStreams.get(sessionId)?.stop();
          resetAudioState(sessionId);
          io.to(roomName(sessionId)).emit("server:error", {
            code: classifiedError.code,
            message: classifiedError.message
          });
          if (session) io.to(roomName(sessionId)).emit("session:updated", { session });
        },
        onClose: () => {
          console.info("[socket] deepgram stream closed", {
            sessionId,
            audioStats: audioChunkStatsBySession.get(sessionId)
          });
          activeStreams.delete(sessionId);
        }
      });

      try {
        stream.start();
        activeStreams.set(sessionId, stream);
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
        socket.emit("connection:state", { state: "connected", message: "Deepgram stream started." });
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error("Could not start transcription stream.");
        const classifiedError = classifyDeepgramError(normalizedError);
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
        console.info("[socket] audio chunk received", {
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
