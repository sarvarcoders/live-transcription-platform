import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import ffmpegPath from "ffmpeg-static";
import { getServerEnv } from "@/server/env";
import { debugInfo } from "@/server/logger";
import type { SttAudioChunkMetadata, SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

const RECENT_TRANSCRIPT_CACHE_LIMIT = 20;
const AUDIO_TRANSCRIPTION_MODELS = new Set(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]);
const execFileAsync = promisify(execFile);

let openaiSttClient: OpenAI | null = null;

type PendingOpenAiChunk = {
  buffers: Buffer[];
  metadata?: SttAudioChunkMetadata;
};

type PreparedAudioUpload = {
  audio: Buffer;
  fileName: string;
  contentType: string;
};

function getClient() {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new SttProviderError("openai", "OPENAI_STT_NOT_CONFIGURED", "OpenAI STT is not configured for Uzbek speech.");
  }

  if (!openaiSttClient) {
    openaiSttClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_STT_TIMEOUT_MS,
      maxRetries: 0
    });
  }

  return openaiSttClient;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function validateChunkedTranscriptionModel(model: string) {
  if (model.toLowerCase().includes("realtime")) {
    throw new SttProviderError(
      "openai",
      "OPENAI_STT_REALTIME_REQUIRES_REALTIME_API",
      "OpenAI realtime STT requires Realtime API, not audio transcriptions endpoint"
    );
  }

  if (!AUDIO_TRANSCRIPTION_MODELS.has(model)) {
    throw new SttProviderError(
      "openai",
      "OPENAI_STT_MODEL_INVALID",
      "OpenAI STT model is not valid for this endpoint"
    );
  }
}

function isUzbekSourceLanguage(sourceLanguage: SttStreamOptions["sourceLanguage"]) {
  return sourceLanguage === "uz";
}

function isUnsupportedLanguageCodeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /language code/i.test(message) && /(not recognized|not supported)/i.test(message);
}

function createLanguageUnsupportedError() {
  return new SttProviderError(
    "openai",
    "OPENAI_STT_LANGUAGE_UNSUPPORTED",
    "OpenAI STT language code is not supported. Using prompt-based language guidance is required."
  );
}

function hasAudioData(audio: Buffer) {
  return audio.some((byte) => byte !== 0);
}

function getInputExtension(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

function getSourceContentType(mimeType: string) {
  return mimeType || "audio/webm";
}

function extractOpenAiErrorDetails(error: unknown) {
  const candidate = error as {
    status?: number;
    code?: string;
    type?: string;
    message?: string;
    error?: { message?: string; code?: string; type?: string };
    response?: { status?: number; data?: unknown };
  };

  return {
    status: candidate.status ?? candidate.response?.status,
    code: candidate.code ?? candidate.error?.code,
    type: candidate.type ?? candidate.error?.type,
    message: candidate.error?.message ?? candidate.message ?? String(error),
    body: candidate.response?.data
  };
}

function isRecoverableChunkError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("audio file might be corrupted") ||
    message.includes("unsupported") ||
    message.includes("invalid file format") ||
    message.includes("could not decode") ||
    message.includes("audio conversion failed")
  );
}

export class OpenAiSttStream implements SttStream {
  readonly provider = "openai" as const;
  private currentBuffers: Buffer[] = [];
  private currentDurationEstimateMs = 0;
  private queuedChunk: PendingOpenAiChunk | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private requestActive = false;
  private stopped = false;
  private recentTranscripts: string[] = [];

  constructor(private readonly options: SttStreamOptions) {}

  start() {
    const env = getServerEnv();
    if (!env.OPENAI_STT_ENABLED || !env.OPENAI_API_KEY) {
      throw new SttProviderError(this.provider, "OPENAI_STT_NOT_CONFIGURED", "OpenAI STT is not configured for Uzbek speech.");
    }

    if (env.OPENAI_STT_MODE === "realtime") {
      throw new SttProviderError(
        this.provider,
        "OPENAI_STT_REALTIME_REQUIRES_REALTIME_API",
        "OpenAI realtime STT requires Realtime API, not audio transcriptions endpoint"
      );
    }

    validateChunkedTranscriptionModel(env.OPENAI_STT_MODEL);

    debugInfo("[stt:openai] chunked STT started", {
      sessionId: this.options.sessionId,
      sourceLanguage: this.options.sourceLanguage,
      mode: env.OPENAI_STT_MODE,
      model: env.OPENAI_STT_MODEL,
      language: isUzbekSourceLanguage(this.options.sourceLanguage) ? "prompt-guided" : env.OPENAI_STT_LANGUAGE,
      promptGuidance: isUzbekSourceLanguage(this.options.sourceLanguage),
      uploadFormat: env.OPENAI_STT_UPLOAD_FORMAT,
      sampleRate: env.OPENAI_STT_SAMPLE_RATE,
      channels: env.OPENAI_STT_CHANNELS,
      minBytes: env.OPENAI_STT_MIN_BYTES,
      chunkMs: env.OPENAI_STT_CHUNK_MS,
      mimeType: this.options.mimeType
    });
  }

  send(audio: Buffer, metadata?: SttAudioChunkMetadata) {
    if (this.stopped || audio.byteLength === 0) return;
    debugInfo("[stt:openai] audio chunk received", {
      sessionId: this.options.sessionId,
      incomingMimeType: this.options.mimeType,
      chunkByteSize: audio.byteLength,
      durationEstimateMs: metadata?.durationEstimateMs,
      isStandaloneFile: metadata?.isStandaloneFile
    });

    if (metadata?.isStandaloneFile) {
      this.enqueueOrTranscribe({ buffers: [audio], metadata });
      return;
    }

    this.currentBuffers.push(audio);
    this.currentDurationEstimateMs += metadata?.durationEstimateMs ?? 0;
    this.ensureFlushTimer();
  }

  stop() {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.currentBuffers = [];
    this.currentDurationEstimateMs = 0;
    this.queuedChunk = null;
    this.options.onClose();
  }

  private ensureFlushTimer() {
    if (this.flushTimer) return;
    const chunkMs = getServerEnv().OPENAI_STT_CHUNK_MS;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushCurrentBuffers();
    }, chunkMs);
  }

  private flushCurrentBuffers() {
    if (this.currentBuffers.length === 0) return;
    const buffers = this.currentBuffers;
    const durationEstimateMs = this.currentDurationEstimateMs || undefined;
    this.currentBuffers = [];
    this.currentDurationEstimateMs = 0;

    this.enqueueOrTranscribe({ buffers, metadata: { durationEstimateMs, isStandaloneFile: false } });
  }

  private enqueueOrTranscribe(chunk: PendingOpenAiChunk) {
    if (this.requestActive) {
      if (this.queuedChunk) {
        debugInfo("[stt:openai] dropping older queued chunk", {
          sessionId: this.options.sessionId,
          droppedByteLength: Buffer.concat(this.queuedChunk.buffers).byteLength,
          nextByteLength: Buffer.concat(chunk.buffers).byteLength
        });
      }
      this.queuedChunk = chunk;
      return;
    }

    void this.transcribeChunk(chunk);
  }

  private async transcribeChunk(chunk: PendingOpenAiChunk) {
    const env = getServerEnv();
    validateChunkedTranscriptionModel(env.OPENAI_STT_MODEL);
    const audio = Buffer.concat(chunk.buffers);
    if (audio.byteLength === 0 || this.stopped) return;
    if (audio.byteLength < env.OPENAI_STT_MIN_BYTES) {
      debugInfo("[stt:openai] chunk skipped below minimum byte threshold", {
        sessionId: this.options.sessionId,
        byteLength: audio.byteLength,
        minBytes: env.OPENAI_STT_MIN_BYTES,
        durationEstimateMs: chunk.metadata?.durationEstimateMs
      });
      return;
    }
    if (!hasAudioData(audio)) {
      debugInfo("[stt:openai] chunk skipped with no audio data", {
        sessionId: this.options.sessionId,
        byteLength: audio.byteLength
      });
      return;
    }

    this.requestActive = true;
    const startedAt = Date.now();

    try {
      debugInfo("[stt:openai] transcription request started", {
        sessionId: this.options.sessionId,
        byteLength: audio.byteLength,
        durationEstimateMs: chunk.metadata?.durationEstimateMs,
        incomingMimeType: this.options.mimeType,
        model: env.OPENAI_STT_MODEL,
        language: isUzbekSourceLanguage(this.options.sourceLanguage) ? "prompt-guided" : env.OPENAI_STT_LANGUAGE,
        promptGuidance: isUzbekSourceLanguage(this.options.sourceLanguage),
        uploadFormat: env.OPENAI_STT_UPLOAD_FORMAT
      });

      const upload = await this.prepareAudioUpload(audio, startedAt);
      debugInfo("[stt:openai] prepared audio upload", {
        sessionId: this.options.sessionId,
        outputFileName: upload.fileName,
        outputContentType: upload.contentType,
        outputByteLength: upload.audio.byteLength,
        durationEstimateMs: chunk.metadata?.durationEstimateMs
      });

      const file = await toFile(upload.audio, upload.fileName, {
        type: upload.contentType
      });

      const transcriptionRequest = {
        file,
        model: env.OPENAI_STT_MODEL,
        response_format: "json" as const,
        ...(isUzbekSourceLanguage(this.options.sourceLanguage)
          ? { prompt: env.OPENAI_STT_PROMPT }
          : { language: env.OPENAI_STT_LANGUAGE })
      };

      const response = await getClient().audio.transcriptions.create(transcriptionRequest, {
        timeout: env.OPENAI_STT_TIMEOUT_MS
      });

      const transcript = normalizeText(response.text ?? "");
      if (!transcript || this.isDuplicateTranscript(transcript)) return;

      debugInfo("[stt:openai] transcript received", {
        sessionId: this.options.sessionId,
        textLength: transcript.length,
        latencyMs: Date.now() - startedAt
      });

      this.options.onTranscript({
        text: transcript,
        isFinal: true,
        provider: this.provider
      });
    } catch (error) {
      if (isUnsupportedLanguageCodeError(error)) {
        this.options.onError(createLanguageUnsupportedError());
        return;
      }

      const details = extractOpenAiErrorDetails(error);
      console.warn("[stt:openai] transcription chunk failed", {
        sessionId: this.options.sessionId,
        status: details.status,
        code: details.code,
        type: details.type,
        message: details.message,
        body: details.body
      });

      if (
        (error instanceof SttProviderError && error.code === "OPENAI_STT_AUDIO_CONVERSION_FAILED") ||
        isRecoverableChunkError(error)
      ) {
        this.options.onRecoverableError?.(
          error instanceof SttProviderError
            ? error
            : new SttProviderError(this.provider, "OPENAI_STT_CHUNK_FAILED", `OpenAI STT failed: ${details.message}`)
        );
        return;
      }

      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.requestActive = false;
      if (!this.stopped && this.queuedChunk) {
        const queued = this.queuedChunk;
        this.queuedChunk = null;
        void this.transcribeChunk(queued);
      }
    }
  }

  private async prepareAudioUpload(audio: Buffer, startedAt: number): Promise<PreparedAudioUpload> {
    const env = getServerEnv();
    if (env.OPENAI_STT_UPLOAD_FORMAT !== "wav") {
      const extension = getInputExtension(this.options.mimeType);
      return {
        audio,
        fileName: `chunk-${this.options.sessionId}-${startedAt}.${extension}`,
        contentType: getSourceContentType(this.options.mimeType)
      };
    }

    const converted = await this.convertToWav(audio, startedAt);
    return {
      audio: converted,
      fileName: "chunk.wav",
      contentType: "audio/wav"
    };
  }

  private async convertToWav(audio: Buffer, startedAt: number) {
    const env = getServerEnv();
    if (!ffmpegPath) {
      throw new SttProviderError(this.provider, "OPENAI_STT_AUDIO_CONVERSION_FAILED", "Audio conversion failed before OpenAI STT");
    }

    const tempDirectory = await mkdtemp(path.join(tmpdir(), "openai-stt-"));
    const inputExtension = getInputExtension(this.options.mimeType);
    const inputFile = path.join(tempDirectory, `input-${startedAt}.${inputExtension}`);
    const outputFile = path.join(tempDirectory, "chunk.wav");

    try {
      await writeFile(inputFile, audio);
      await execFileAsync(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inputFile,
          "-ac",
          String(env.OPENAI_STT_CHANNELS),
          "-ar",
          String(env.OPENAI_STT_SAMPLE_RATE),
          "-vn",
          "-f",
          "wav",
          outputFile
        ],
        { timeout: env.OPENAI_STT_TIMEOUT_MS }
      );
      return await readFile(outputFile);
    } catch (error) {
      console.warn("[stt:openai] audio conversion failed", {
        sessionId: this.options.sessionId,
        incomingMimeType: this.options.mimeType,
        inputByteLength: audio.byteLength,
        outputFileName: "chunk.wav",
        outputContentType: "audio/wav",
        message: error instanceof Error ? error.message : String(error)
      });
      throw new SttProviderError(this.provider, "OPENAI_STT_AUDIO_CONVERSION_FAILED", "Audio conversion failed before OpenAI STT");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  private isDuplicateTranscript(text: string) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) return true;
    if (this.recentTranscripts.includes(normalized)) return true;
    this.recentTranscripts = [...this.recentTranscripts.slice(-(RECENT_TRANSCRIPT_CACHE_LIMIT - 1)), normalized];
    return false;
  }
}
