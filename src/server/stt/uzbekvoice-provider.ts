import { getServerEnv } from "@/server/env";
import { debugInfo } from "@/server/logger";
import type { SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

const RECENT_TRANSCRIPT_CACHE_LIMIT = 20;

type JsonObject = Record<string, unknown>;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findTranscriptText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTranscriptText(item);
      if (found) return found;
    }
    return null;
  }

  const object = value as JsonObject;
  for (const key of ["text", "transcript", "sentence", "result"]) {
    const candidate = object[key];
    if (typeof candidate === "string" && normalizeText(candidate)) return normalizeText(candidate);
  }

  for (const nestedValue of Object.values(object)) {
    const found = findTranscriptText(nestedValue);
    if (found) return found;
  }

  return null;
}

function getErrorText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const object = value as JsonObject;
  for (const key of ["error", "message", "detail"]) {
    const candidate = object[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function isUzbekVoiceConfigured() {
  const env = getServerEnv();
  return Boolean(env.UZBEKVOICE_STT_ENABLED && env.UZBEKVOICE_API_KEY);
}

export class UzbekVoiceChunkedSttStream implements SttStream {
  readonly provider = "uzbekvoice" as const;
  private currentBuffers: Buffer[] = [];
  private queuedBuffers: Buffer[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private requestActive = false;
  private stopped = false;
  private recentTranscripts: string[] = [];

  constructor(private readonly options: SttStreamOptions) {}

  start() {
    const env = getServerEnv();
    if (!env.UZBEKVOICE_STT_ENABLED || !env.UZBEKVOICE_API_KEY) {
      throw new SttProviderError(this.provider, "UZBEKVOICE_STT_NOT_CONFIGURED", "UzbekVoice STT is not configured.");
    }

    debugInfo("[stt:uzbekvoice] chunked provider started", {
      sessionId: this.options.sessionId,
      mode: env.UZBEKVOICE_STT_MODE,
      chunkMs: env.UZBEKVOICE_STT_CHUNK_MS,
      language: env.UZBEKVOICE_STT_LANGUAGE,
      model: env.UZBEKVOICE_STT_MODEL,
      blocking: env.UZBEKVOICE_STT_BLOCKING,
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
    const chunkMs = getServerEnv().UZBEKVOICE_STT_CHUNK_MS;
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
    const audio = Buffer.concat(buffers);
    if (audio.byteLength === 0 || this.stopped) return;

    this.requestActive = true;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.UZBEKVOICE_STT_TIMEOUT_MS);

    try {
      const formData = new FormData();
      const file = new Blob([audio], { type: this.options.mimeType || "audio/webm" });
      formData.append("file", file, `chunk-${this.options.sessionId}-${startedAt}.webm`);
      formData.append("return_offsets", "false");
      formData.append("run_diarization", "false");
      formData.append("language", env.UZBEKVOICE_STT_LANGUAGE);
      formData.append("model", env.UZBEKVOICE_STT_MODEL);
      formData.append("blocking", String(env.UZBEKVOICE_STT_BLOCKING));

      debugInfo("[stt:uzbekvoice] chunk upload started", {
        sessionId: this.options.sessionId,
        byteLength: audio.byteLength,
        timeoutMs: env.UZBEKVOICE_STT_TIMEOUT_MS
      });

      const response = await fetch(`${env.UZBEKVOICE_BASE_URL.replace(/\/+$/, "")}/api/v1/stt`, {
        method: "POST",
        headers: {
          Authorization: env.UZBEKVOICE_API_KEY ?? ""
        },
        body: formData,
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();

      if (!response.ok) {
        const errorText = getErrorText(payload) ?? (typeof payload === "string" ? payload : response.statusText);
        throw new SttProviderError(
          this.provider,
          "UZBEKVOICE_STT_FAILED",
          `UzbekVoice STT failed: ${normalizeText(errorText).slice(0, 240)}`
        );
      }

      const transcript = findTranscriptText(payload);
      if (!transcript || this.isDuplicateTranscript(transcript)) return;

      debugInfo("[stt:uzbekvoice] chunk transcript received", {
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
      if (error instanceof Error && error.name === "AbortError") {
        this.options.onError(
          new SttProviderError(this.provider, "UZBEKVOICE_STT_FAILED", "UzbekVoice STT failed: request timed out")
        );
        return;
      }
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      clearTimeout(timeout);
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
