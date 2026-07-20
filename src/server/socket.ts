import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type { LanguageCode } from "@/shared/languages";
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
import {
  TranscriptSegmenter,
  type CommittedTranscriptSegment,
  type SegmentCommitReason
} from "./transcript-segmenter";
import { classifyTranslationError, streamTranslateTranscript } from "./translator";

type TranslationServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TranslationSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TranslationQueueItem = {
  sequenceId: number;
  commitReason: SegmentCommitReason;
  segment: TranscriptSegment;
};
type TranslationQueueState = {
  active: boolean;
  items: TranslationQueueItem[];
  queuedSegmentIds: Set<string>;
  latestCompletedSequenceId: number;
};

const DEFAULT_NO_AUDIO_TIMEOUT_MS = 3000;
const OPENAI_CHUNKED_NO_AUDIO_TIMEOUT_MS = 15000;
const MAX_TRANSLATION_QUEUE_ITEMS = 200;

const activeStreams = new Map<string, SttStream>();
const audioChunkStatsBySession = new Map<string, { count: number; totalBytes: number; lastChunkAt?: number }>();
const noAudioTimersBySession = new Map<string, NodeJS.Timeout>();
const lastAudioTimingBySession = new Map<string, { capturedAt: number; sentAt: number; audioReceivedAt: number }>();
const transcriptSegmentersBySession = new Map<string, TranscriptSegmenter>();
const segmenterCleanupTimersBySession = new Map<string, NodeJS.Timeout>();
const stoppingSessions = new Set<string>();
const streamsPendingFinalFlush = new WeakSet<SttStream>();
const translationQueuesBySession = new Map<string, TranslationQueueState>();

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

function getNoAudioTimeoutMs(provider: ActiveSttProvider) {
  return provider === "openai" ? OPENAI_CHUNKED_NO_AUDIO_TIMEOUT_MS : DEFAULT_NO_AUDIO_TIMEOUT_MS;
}

function resetNoAudioTimer(socket: TranslationSocket, sessionId: string, provider: ActiveSttProvider, reason: string) {
  clearNoAudioTimer(sessionId);
  const stats = audioChunkStatsBySession.get(sessionId);
  if (stats && stats.count > 0) {
    debugInfo("[socket] no-audio monitor cleared after progress", {
      sessionId,
      provider,
      reason,
      chunkCount: stats.count,
      totalBytes: stats.totalBytes
    });
    return;
  }

  const timeoutMs = getNoAudioTimeoutMs(provider);
  noAudioTimersBySession.set(
    sessionId,
    setTimeout(() => {
      noAudioTimersBySession.delete(sessionId);
      const latestStats = audioChunkStatsBySession.get(sessionId);
      if (!latestStats || latestStats.count === 0) {
        console.warn("[socket] no audio chunks received after audio:start", {
          sessionId,
          socketId: socket.id,
          provider,
          timeoutMs,
          lastResetReason: reason
        });
        emitError(socket, "NO_AUDIO_CHUNKS", "Microphone started but no audio chunks were sent");
      }
    }, timeoutMs)
  );
  debugInfo("[socket] no-audio monitor armed", {
    sessionId,
    provider,
    reason,
    timeoutMs
  });
}

function resetAudioState(sessionId: string) {
  activeStreams.delete(sessionId);
  audioChunkStatsBySession.delete(sessionId);
  clearNoAudioTimer(sessionId);
  lastAudioTimingBySession.delete(sessionId);
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

function getTranslationQueue(sessionId: string) {
  const existing = translationQueuesBySession.get(sessionId);
  if (existing) return existing;
  const created: TranslationQueueState = {
    active: false,
    items: [],
    queuedSegmentIds: new Set<string>(),
    latestCompletedSequenceId: 0
  };
  translationQueuesBySession.set(sessionId, created);
  return created;
}

function isRetryableTranslationError(error: unknown) {
  const candidate = error as { status?: number; code?: string; message?: string };
  const status = Number(candidate?.status);
  if ([400, 401, 403, 429].includes(status)) return false;
  if (status === 408 || status === 409 || status === 425 || status >= 500) return true;
  const message = (candidate?.message ?? String(error)).toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("connection reset");
}

async function translateQueueItem(sessionId: string, item: TranslationQueueItem) {
  let firstTokenAt: number | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const translatedText = await streamTranslateTranscript({
        text: item.segment.text,
        sourceLanguage: item.segment.sourceLanguage,
        targetLanguage: item.segment.targetLanguage,
        ...getPreviousTranslationContext(sessionId, item.segment.id),
        onFirstToken: () => {
          firstTokenAt ??= Date.now();
        },
        onToken: () => {
          // Stable mode waits for the complete translation before updating subtitles.
        }
      });
      return { translatedText, firstTokenAt };
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isRetryableTranslationError(error)) break;
      console.warn("[translation] temporary failure; retrying once", {
        sessionId,
        segmentId: item.segment.id,
        sequenceId: item.sequenceId
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  throw lastError;
}

function processTranslationQueue(io: TranslationServer, sessionId: string) {
  const queue = getTranslationQueue(sessionId);
  if (queue.active) return;
  const item = queue.items.shift();
  if (!item) {
    translationQueuesBySession.delete(sessionId);
    return;
  }

  queue.active = true;
  const translationStartedAt = Date.now();
  console.info("[translation] started", {
    sessionId,
    segmentId: item.segment.id,
    sequenceId: item.sequenceId,
    commitReason: item.commitReason,
    queuedRemaining: queue.items.length
  });
  emitSegment(io, sessionId, {
    ...item.segment,
    isFinal: false,
    translationStatus: "pending",
    metrics: {
      ...item.segment.metrics,
      translationStartedAt
    }
  });

  void translateQueueItem(sessionId, item)
    .then(({ translatedText, firstTokenAt }) => {
      if (item.sequenceId < queue.latestCompletedSequenceId) {
        debugInfo("[translation] stale response ignored", {
          sessionId,
          segmentId: item.segment.id,
          sequenceId: item.sequenceId,
          latestCompletedSequenceId: queue.latestCompletedSequenceId
        });
        return;
      }

      const translationCompletedAt = Date.now();
      queue.latestCompletedSequenceId = item.sequenceId;
      const translatedSegment: TranscriptSegment = {
        ...item.segment,
        translatedText,
        isFinal: true,
        translationStatus: "complete",
        completedAt: new Date(translationCompletedAt).toISOString(),
        metrics: {
          ...item.segment.metrics,
          translationStartedAt,
          firstTokenAt,
          translationCompletedAt,
          openaiFirstTokenLatencyMs: firstTokenAt ? firstTokenAt - translationStartedAt : undefined,
          openaiTotalLatencyMs: translationCompletedAt - translationStartedAt
        }
      };
      sessionStore.addTranscript(sessionId, translatedSegment);
      emitSegment(io, sessionId, translatedSegment);
      clearNoAudioTimer(sessionId);
      console.info("[translation] completed", {
        sessionId,
        segmentId: item.segment.id,
        sequenceId: item.sequenceId,
        textLength: translatedText.length,
        latencyMs: translationCompletedAt - translationStartedAt,
        microphoneContinues: !stoppingSessions.has(sessionId)
      });
    })
    .catch((error: unknown) => {
      const classifiedError = classifyTranslationError(error);
      console.warn("[translation] failed; microphone and queue continue", {
        sessionId,
        segmentId: item.segment.id,
        sequenceId: item.sequenceId,
        code: classifiedError.code,
        message: classifiedError.message
      });
      emitSegment(io, sessionId, {
        ...item.segment,
        isFinal: false,
        translationStatus: "error",
        metrics: {
          ...item.segment.metrics,
          translationStartedAt
        }
      });
      io.to(roomName(sessionId)).emit("server:error", {
        code: classifiedError.code,
        message: classifiedError.message
      });
    })
    .finally(() => {
      queue.active = false;
      queue.queuedSegmentIds.delete(item.segment.id);
      processTranslationQueue(io, sessionId);
    });
}

function queueCommittedSegment(
  io: TranslationServer,
  sessionId: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  committed: CommittedTranscriptSegment
) {
  const segmentId = randomUUID();
  const queue = getTranslationQueue(sessionId);
  if (queue.queuedSegmentIds.has(segmentId)) return;

  const segment: TranscriptSegment = {
    id: segmentId,
    sessionId,
    text: committed.text,
    sourceLanguage,
    targetLanguage,
    sttProvider: committed.provider,
    isFinal: true,
    translationStatus: "pending",
    confidence: committed.confidence,
    startedAt: committed.startedAt,
    completedAt: committed.completedAt,
    metrics: committed.metrics
  };

  if (queue.items.length >= MAX_TRANSLATION_QUEUE_ITEMS) {
    const tail = queue.items.at(-1);
    if (tail) {
      tail.segment.text = `${tail.segment.text} ${segment.text}`.replace(/\s+/g, " ").trim();
      tail.segment.completedAt = segment.completedAt;
      console.warn("[translation] queue limit reached; committed segments merged", {
        sessionId,
        queueLimit: MAX_TRANSLATION_QUEUE_ITEMS,
        mergedIntoSegmentId: tail.segment.id,
        appendedSequenceId: committed.sequenceId
      });
      return;
    }
  }

  queue.items.push({
    sequenceId: committed.sequenceId,
    commitReason: committed.reason,
    segment
  });
  queue.queuedSegmentIds.add(segmentId);
  console.info("[translation] queued", {
    sessionId,
    segmentId,
    sequenceId: committed.sequenceId,
    commitReason: committed.reason,
    queueLength: queue.items.length
  });
  processTranslationQueue(io, sessionId);
}

function clearSegmenterCleanupTimer(sessionId: string) {
  const timer = segmenterCleanupTimersBySession.get(sessionId);
  if (timer) clearTimeout(timer);
  segmenterCleanupTimersBySession.delete(sessionId);
}

function createSessionSegmenter(
  io: TranslationServer,
  sessionId: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
) {
  clearSegmenterCleanupTimer(sessionId);
  const previousSegmenter = transcriptSegmentersBySession.get(sessionId);
  if (previousSegmenter) {
    flushSpecificSegmenter(sessionId, previousSegmenter, "stop_flush");
    previousSegmenter.dispose();
  }
  const env = getServerEnv();
  const segmenter = new TranscriptSegmenter(
    {
      commitOnPunctuation: env.TRANSLATION_COMMIT_ON_PUNCTUATION,
      silenceMs: env.TRANSLATION_COMMIT_SILENCE_MS,
      minChars: env.TRANSLATION_SEGMENT_MIN_CHARS,
      maxChars: env.TRANSLATION_SEGMENT_MAX_CHARS,
      maxDurationMs: env.TRANSLATION_SEGMENT_MAX_DURATION_MS,
      finalDebounceMs: env.TRANSLATION_FINAL_DEBOUNCE_MS
    },
    (committed) => {
      clearNoAudioTimer(sessionId);
      console.info("[segmenter] segment committed", {
        sessionId,
        sequenceId: committed.sequenceId,
        reason: committed.reason,
        textLength: committed.text.length
      });
      queueCommittedSegment(io, sessionId, sourceLanguage, targetLanguage, committed);
    }
  );
  transcriptSegmentersBySession.set(sessionId, segmenter);
  console.info("[segmenter] stable sentence mode started", {
    sessionId,
    mode: env.TRANSLATION_SEGMENT_MODE,
    interimTranslationEnabled: env.INTERIM_TRANSLATION_ENABLED,
    silenceMs: env.TRANSLATION_COMMIT_SILENCE_MS,
    minChars: env.TRANSLATION_SEGMENT_MIN_CHARS,
    maxChars: env.TRANSLATION_SEGMENT_MAX_CHARS,
    maxDurationMs: env.TRANSLATION_SEGMENT_MAX_DURATION_MS,
    finalDebounceMs: env.TRANSLATION_FINAL_DEBOUNCE_MS
  });
  return segmenter;
}

function flushTranscriptBuffer(sessionId: string, reason: SegmentCommitReason = "stop_flush") {
  const segmenter = transcriptSegmentersBySession.get(sessionId);
  if (!segmenter) return;
  flushSpecificSegmenter(sessionId, segmenter, reason);
}

function flushSpecificSegmenter(
  sessionId: string,
  segmenter: TranscriptSegmenter,
  reason: SegmentCommitReason = "stop_flush"
) {
  const bufferLength = segmenter.currentTranscriptBuffer.length;
  const committedText = segmenter.flush(reason);
  console.info("[segmenter] remaining buffer flushed", {
    sessionId,
    reason,
    bufferLength,
    committed: Boolean(committedText)
  });
}

function disposeSessionSegmenter(sessionId: string) {
  clearSegmenterCleanupTimer(sessionId);
  transcriptSegmentersBySession.get(sessionId)?.dispose();
  transcriptSegmentersBySession.delete(sessionId);
  stoppingSessions.delete(sessionId);
}

function scheduleSegmenterCleanup(sessionId: string) {
  clearSegmenterCleanupTimer(sessionId);
  const cleanupDelayMs = Math.max(60000, getServerEnv().OPENAI_STT_TIMEOUT_MS + 2000);
  const timer = setTimeout(() => {
    segmenterCleanupTimersBySession.delete(sessionId);
    flushTranscriptBuffer(sessionId, "stop_flush");
    disposeSessionSegmenter(sessionId);
  }, cleanupDelayMs);
  segmenterCleanupTimersBySession.set(sessionId, timer);
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

      const previousStream = activeStreams.get(sessionId);
      if (previousStream) {
        streamsPendingFinalFlush.add(previousStream);
        previousStream.stop();
      }
      resetAudioState(sessionId);
      stoppingSessions.delete(sessionId);
      clearSegmenterCleanupTimer(sessionId);

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
      const segmenter = createSessionSegmenter(
        io,
        sessionId,
        liveSession.sourceLanguage,
        liveSession.targetLanguage
      );

      const handleTranscript = (transcript: SttTranscript) => {
        const sttReceivedAt = Date.now();
        debugInfo("[socket] stt transcript received", {
          sessionId,
          provider: transcript.provider,
          isFinal: transcript.isFinal,
          speechFinal: transcript.speechFinal,
          textLength: transcript.text.length,
          confidence: transcript.confidence
        });

        const metrics = baseMetrics(sessionId, sttReceivedAt);

        if (transcript.isFinal) {
          const appendResult = segmenter.append({
            text: transcript.text,
            provider: transcript.provider,
            confidence: transcript.confidence,
            receivedAt: sttReceivedAt,
            speechFinal: transcript.speechFinal,
            metrics
          });
          console.info("[segmenter] transcript fragment received", {
            sessionId,
            provider: transcript.provider,
            fragmentLength: transcript.text.length,
            disposition: appendResult.disposition,
            currentBufferLength: appendResult.currentBufferLength,
            speechFinal: transcript.speechFinal
          });

          if (appendResult.currentBufferLength > 0) {
            emitSegment(io, sessionId, {
              id: `interim:${sessionId}`,
              sessionId,
              text: appendResult.currentTranscriptBuffer,
              sourceLanguage: liveSession.sourceLanguage,
              targetLanguage: liveSession.targetLanguage,
              isFinal: false,
              sttProvider: transcript.provider,
              confidence: transcript.confidence,
              startedAt: new Date(sttReceivedAt).toISOString(),
              metrics
            });
          }
        } else {
          debugInfo("[stt] interim transcript received", {
            sessionId,
            provider: transcript.provider,
            textLength: transcript.text.length
          });
          emitSegment(io, sessionId, {
            id: `interim:${sessionId}`,
            sessionId,
            text: transcript.text,
            sourceLanguage: liveSession.sourceLanguage,
            targetLanguage: liveSession.targetLanguage,
            isFinal: false,
            sttProvider: transcript.provider,
            confidence: transcript.confidence,
            startedAt: new Date(sttReceivedAt).toISOString(),
            metrics
          });
        }
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
          onRecoverableError: (error) => {
            const classifiedError = classifySttError(provider, error);
            console.warn("[stt] chunk failure skipped; microphone continues", {
              sessionId,
              provider,
              code: classifiedError.code,
              message: classifiedError.message
            });
            io.to(roomName(sessionId)).emit("server:error", {
              code: classifiedError.code,
              message: classifiedError.message
            });
          },
          onActivity: (activity) => {
            resetNoAudioTimer(socket, sessionId, provider, activity);
          },
          onClose: () => {
            debugInfo("[socket] stt stream closed", {
              sessionId,
              provider,
              audioStats: audioChunkStatsBySession.get(sessionId)
            });
            if (activeStreams.get(sessionId) === stream) activeStreams.delete(sessionId);
            if (streamsPendingFinalFlush.has(stream)) {
              flushSpecificSegmenter(sessionId, segmenter, "stop_flush");
              if (transcriptSegmentersBySession.get(sessionId) === segmenter) {
                disposeSessionSegmenter(sessionId);
              } else {
                segmenter.dispose();
              }
            }
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

      const startAudioMonitoring = (provider: ActiveSttProvider) => {
        audioChunkStatsBySession.set(sessionId, { count: 0, totalBytes: 0 });
        resetNoAudioTimer(socket, sessionId, provider, "audio:start");
      };

      try {
        startProviderStream(selection.provider, selection.fallbackReason);
        startAudioMonitoring(selection.provider);
        socket.emit("connection:state", { state: "connected", message: `${getProviderLabel(selection.provider)} STT stream started.` });
      } catch (error) {
        const classifiedError = classifySttError(selection.provider, error);
        if (canFallbackToDeepgram(selection.provider, liveSession.sourceLanguage, selection.requestedProvider)) {
          try {
            fallbackUsed = true;
            const fallbackMessage = `${classifiedError.message} STT provider switched to Deepgram`;
            startProviderStream("deepgram", fallbackMessage);
            startAudioMonitoring("deepgram");
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

    socket.on("audio:chunk", ({ sessionId, audio, capturedAt, sentAt, durationEstimateMs, isStandaloneFile }) => {
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
      resetNoAudioTimer(socket, sessionId, stream.provider, "audio:chunk");
      if (nextStats.count <= 5 || nextStats.count % 50 === 0) {
        debugInfo("[socket] audio chunk received", {
          sessionId,
          count: nextStats.count,
          byteLength: audioBuffer.byteLength,
          totalBytes: nextStats.totalBytes,
          durationEstimateMs,
          isStandaloneFile
        });
      }
      if (stream.provider === "openai") {
        console.info("[socket] OpenAI STT chunk sent", {
          sessionId,
          count: nextStats.count,
          byteLength: audioBuffer.byteLength,
          durationEstimateMs,
          isStandaloneFile
        });
      }
      lastAudioTimingBySession.set(sessionId, {
        capturedAt,
        sentAt,
        audioReceivedAt: Date.now()
      });
      stream.send(audioBuffer, { capturedAt, sentAt, durationEstimateMs, isStandaloneFile });
    });

    socket.on("audio:stop", ({ sessionId }) => {
      const liveSession = sessionStore.getLive(sessionId);
      if (!liveSession || liveSession.hostSocketId !== socket.id) return;
      console.info("[socket] audio:stop requested; waiting for final STT chunks", { sessionId });
      stoppingSessions.add(sessionId);
      scheduleSegmenterCleanup(sessionId);
      const stream = activeStreams.get(sessionId);
      if (stream) streamsPendingFinalFlush.add(stream);
      stream?.stop();
      resetAudioState(sessionId);
      if (!stream) {
        flushTranscriptBuffer(sessionId, "stop_flush");
        disposeSessionSegmenter(sessionId);
      }
    });

    socket.on("session:leave", ({ sessionId }) => {
      if (socket.data.role === "host") {
        stoppingSessions.add(sessionId);
        scheduleSegmenterCleanup(sessionId);
        const stream = activeStreams.get(sessionId);
        if (stream) streamsPendingFinalFlush.add(stream);
        stream?.stop();
        resetAudioState(sessionId);
        if (!stream) {
          flushTranscriptBuffer(sessionId, "stop_flush");
          disposeSessionSegmenter(sessionId);
        }
      }
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
        stoppingSessions.add(sessionId);
        scheduleSegmenterCleanup(sessionId);
        const stream = activeStreams.get(sessionId);
        if (stream) streamsPendingFinalFlush.add(stream);
        stream?.stop();
        resetAudioState(sessionId);
        if (!stream) {
          flushTranscriptBuffer(sessionId, "stop_flush");
          disposeSessionSegmenter(sessionId);
        }
      }

      const changedSessions = sessionStore.detachSocket(socket.id);
      for (const session of changedSessions) {
        io.to(roomName(session.id)).emit("session:updated", { session });
      }
    });
  });
}
