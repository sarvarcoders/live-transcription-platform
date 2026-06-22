import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { LanguageCode } from "@/shared/languages";
import { getDeepgramLanguage } from "@/shared/languages";
import { getServerEnv } from "./env";

export interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

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
}

interface StreamOptions {
  sessionId: string;
  sourceLanguage: LanguageCode;
  mimeType: string;
  onTranscript: (transcript: DeepgramTranscript) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export class DeepgramStream {
  private connection: DeepgramLiveConnection | null = null;
  private isOpen = false;
  private pendingAudio: Buffer[] = [];

  constructor(private readonly options: StreamOptions) {}

  start() {
    const env = getServerEnv();
    const deepgram = createClient(env.DEEPGRAM_API_KEY);
    const language = getDeepgramLanguage(this.options.sourceLanguage);

    console.info("[deepgram] websocket connecting", {
      sessionId: this.options.sessionId,
      model: env.DEEPGRAM_MODEL,
      language,
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
      console.info("[deepgram] websocket opened", {
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

      console.info("[deepgram] transcript received", {
        sessionId: this.options.sessionId,
        isFinal: Boolean(event.is_final),
        confidence: typeof alternative?.confidence === "number" ? alternative.confidence : undefined,
        textLength: text.length
      });

      this.options.onTranscript({
        text,
        isFinal: Boolean(event.is_final),
        confidence: typeof alternative?.confidence === "number" ? alternative.confidence : undefined
      });
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      console.error("[deepgram] websocket error", {
        sessionId: this.options.sessionId,
        message: normalizedError.message
      });
      this.options.onError(normalizedError);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      console.info("[deepgram] websocket closed", {
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
