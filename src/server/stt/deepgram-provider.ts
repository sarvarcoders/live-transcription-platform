import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { getDeepgramLanguage } from "@/shared/languages";
import { getServerEnv } from "@/server/env";
import { debugInfo } from "@/server/logger";
import type { SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

interface DeepgramLiveConnection {
  on(event: string, listener: (...args: unknown[]) => void): void;
  send(audio: Buffer): void;
  finish(): void;
}

interface DeepgramTranscriptEvent {
  channel?: {
    alternatives?: Array<{
      transcript?: unknown;
      confidence?: unknown;
    }>;
  };
  is_final?: unknown;
  speech_final?: unknown;
}

function isDeepgramConfigError(error: Error) {
  const message = error.message.toLowerCase();
  return (
    message.includes("400") ||
    message.includes("model") ||
    message.includes("language") ||
    message.includes("unsupported") ||
    message.includes("invalid")
  );
}

export class DeepgramSttStream implements SttStream {
  readonly provider = "deepgram" as const;
  private connection: DeepgramLiveConnection | null = null;
  private isOpen = false;
  private pendingAudio: Buffer[] = [];

  constructor(private readonly options: SttStreamOptions) {}

  start() {
    const env = getServerEnv();
    const deepgram = createClient(env.DEEPGRAM_API_KEY);
    const language = getDeepgramLanguage(this.options.sourceLanguage);
    const isUzbekTestMode = this.options.sourceLanguage === "uz";

    if (isUzbekTestMode) {
      console.info("[stt:deepgram] Uzbek STT test diagnostics", {
        sessionId: this.options.sessionId,
        sourceLanguage: this.options.sourceLanguage,
        deepgramLanguage: language,
        model: env.DEEPGRAM_MODEL,
        endpointing: env.DEEPGRAM_ENDPOINTING_MS,
        mimeType: this.options.mimeType
      });
    }

    debugInfo("[stt:deepgram] websocket connecting", {
      sessionId: this.options.sessionId,
      model: env.DEEPGRAM_MODEL,
      language,
      uzbekTestMode: isUzbekTestMode,
      endpointing: env.DEEPGRAM_ENDPOINTING_MS,
      mimeType: this.options.mimeType
    });

    this.connection = deepgram.listen.live({
      model: env.DEEPGRAM_MODEL,
      language,
      smart_format: false,
      interim_results: true,
      endpointing: env.DEEPGRAM_ENDPOINTING_MS,
      vad_events: true
    }) as unknown as DeepgramLiveConnection;

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      this.isOpen = true;
      if (isUzbekTestMode) {
        console.info("[stt:deepgram] Uzbek STT test accepted by Deepgram", {
          sessionId: this.options.sessionId,
          deepgramLanguage: language,
          model: env.DEEPGRAM_MODEL
        });
      }
      debugInfo("[stt:deepgram] websocket opened", {
        sessionId: this.options.sessionId,
        queuedAudioChunks: this.pendingAudio.length
      });
      for (const audio of this.pendingAudio.splice(0)) {
        this.connection?.send(audio);
      }
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const event = data as DeepgramTranscriptEvent;
      const alternative = event.channel?.alternatives?.[0];
      const text = typeof alternative?.transcript === "string" ? alternative.transcript.trim() : "";
      if (!text) return;

      debugInfo("[stt:deepgram] transcript received", {
        sessionId: this.options.sessionId,
        isFinal: Boolean(event.is_final),
        speechFinal: Boolean(event.speech_final),
        confidence: typeof alternative?.confidence === "number" ? alternative.confidence : undefined,
        textLength: text.length
      });

      this.options.onTranscript({
        text,
        isFinal: Boolean(event.is_final),
        speechFinal: Boolean(event.speech_final),
        confidence: typeof alternative?.confidence === "number" ? alternative.confidence : undefined,
        provider: this.provider
      });
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      console.error("[stt:deepgram] websocket error", {
        sessionId: this.options.sessionId,
        message: normalizedError.message
      });
      if (isUzbekTestMode && isDeepgramConfigError(normalizedError)) {
        this.options.onError(
          new SttProviderError(
            this.provider,
            "DEEPGRAM_UZBEK_UNSUPPORTED",
            "Deepgram Uzbek STT is not supported by the selected model."
          )
        );
        return;
      }
      this.options.onError(normalizedError);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      debugInfo("[stt:deepgram] websocket closed", {
        sessionId: this.options.sessionId
      });
      this.options.onClose();
    });
  }

  send(audio: Buffer) {
    if (!this.connection || audio.byteLength === 0) return;
    if (!this.isOpen) {
      this.pendingAudio = [...this.pendingAudio.slice(-20), audio];
      return;
    }
    this.connection.send(audio);
  }

  stop() {
    if (!this.connection) return;
    this.connection.finish();
    this.connection = null;
    this.isOpen = false;
    this.pendingAudio = [];
  }
}
