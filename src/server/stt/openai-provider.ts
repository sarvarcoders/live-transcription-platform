import OpenAI, { toFile } from "openai";
import { getServerEnv } from "@/server/env";
import { debugInfo } from "@/server/logger";
import type { SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

const RECENT_TRANSCRIPT_CACHE_LIMIT = 20;
const AUDIO_TRANSCRIPTION_MODELS = new Set(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]);

let openaiSttClient: OpenAI | null = null;

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

export class OpenAiSttStream implements SttStream {
  readonly provider = "openai" as const;
  private currentBuffers: Buffer[] = [];
  private queuedBuffers: Buffer[] = [];
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
      language: env.OPENAI_STT_LANGUAGE,
      chunkMs: env.OPENAI_STT_CHUNK_MS,
      mimeType: this.options.mimeType
    });
  }

  send(audio: Buffer) {
    if (this.stopped || audio.byteLength === 0) return;
    this.currentBuffers.push(audio);
    this.ensureFlushTimer();
  }

  stop() {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.currentBuffers = [];
    this.queuedBuffers = [];
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
    this.currentBuffers = [];

    if (this.requestActive) {
      this.queuedBuffers.push(...buffers);
      return;
    }

    void this.transcribeBuffers(buffers);
  }

  private async transcribeBuffers(buffers: Buffer[]) {
    const env = getServerEnv();
    validateChunkedTranscriptionModel(env.OPENAI_STT_MODEL);
    const audio = Buffer.concat(buffers);
    if (audio.byteLength === 0 || this.stopped) return;

    this.requestActive = true;
    const startedAt = Date.now();

    try {
      debugInfo("[stt:openai] transcription request started", {
        sessionId: this.options.sessionId,
        byteLength: audio.byteLength,
        model: env.OPENAI_STT_MODEL,
        language: env.OPENAI_STT_LANGUAGE
      });

      const file = await toFile(audio, `chunk-${this.options.sessionId}-${startedAt}.webm`, {
        type: this.options.mimeType || "audio/webm"
      });

      const response = await getClient().audio.transcriptions.create({
        file,
        model: env.OPENAI_STT_MODEL,
        language: env.OPENAI_STT_LANGUAGE,
        response_format: "json"
      }, {
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
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.requestActive = false;
      if (!this.stopped && this.queuedBuffers.length > 0) {
        const queued = this.queuedBuffers;
        this.queuedBuffers = [];
        void this.transcribeBuffers(queued);
      }
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
