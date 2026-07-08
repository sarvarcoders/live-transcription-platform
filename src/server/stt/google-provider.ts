import { SpeechClient } from "@google-cloud/speech";
import type { LanguageCode } from "@/shared/languages";
import { getServerEnv } from "@/server/env";
import { debugInfo } from "@/server/logger";
import type { SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

interface GoogleStreamingRecognizeResult {
  isFinal?: boolean;
  alternatives?: Array<{
    transcript?: string;
    confidence?: number;
  }>;
}

interface GoogleStreamingRecognizeResponse {
  results?: GoogleStreamingRecognizeResult[];
}

interface GoogleRecognizeStream {
  on(event: "data", listener: (data: GoogleStreamingRecognizeResponse) => void): GoogleRecognizeStream;
  on(event: "error", listener: (error: Error) => void): GoogleRecognizeStream;
  on(event: "end" | "close", listener: () => void): GoogleRecognizeStream;
  write(chunk: Buffer): void;
  end(): void;
  destroy?: () => void;
}

interface GoogleCredentialsJson {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

function getGoogleLanguageCode(sourceLanguage: LanguageCode) {
  const env = getServerEnv();
  if (sourceLanguage === "uz") return env.GOOGLE_STT_LANGUAGE_CODE || "uz-UZ";
  if (sourceLanguage === "ru") return "ru-RU";
  return "en-US";
}

function getAudioEncoding(mimeType: string) {
  if (mimeType.includes("ogg")) return "OGG_OPUS";
  if (mimeType.includes("webm")) return "WEBM_OPUS";
  return "WEBM_OPUS";
}

export function isGoogleSttConfigured() {
  const env = getServerEnv();
  return Boolean(
    env.GOOGLE_STT_ENABLED &&
      (env.GOOGLE_STT_CREDENTIALS_JSON || env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_STT_PROJECT_ID)
  );
}

function parseGoogleCredentialsJson(value: string): GoogleCredentialsJson {
  try {
    const parsed = JSON.parse(value.trim()) as GoogleCredentialsJson;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing required fields");
    }
    return parsed;
  } catch {
    throw new SttProviderError("google", "GOOGLE_STT_CREDENTIALS_INVALID", "Google credentials JSON is invalid");
  }
}

function getGoogleClientOptions() {
  const env = getServerEnv();
  if (!env.GOOGLE_STT_CREDENTIALS_JSON) {
    return {
      projectId: env.GOOGLE_STT_PROJECT_ID || undefined
    };
  }

  const credentials = parseGoogleCredentialsJson(env.GOOGLE_STT_CREDENTIALS_JSON);
  return {
    projectId: env.GOOGLE_STT_PROJECT_ID || credentials.project_id || undefined,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key
    }
  };
}

export class GoogleSttStream implements SttStream {
  readonly provider = "google" as const;
  private stream: GoogleRecognizeStream | null = null;
  private isOpen = false;
  private pendingAudio: Buffer[] = [];

  constructor(private readonly options: SttStreamOptions) {}

  start() {
    const env = getServerEnv();
    if (!env.GOOGLE_STT_ENABLED) {
      throw new SttProviderError(this.provider, "GOOGLE_STT_NOT_CONFIGURED", "Google STT is not configured");
    }

    if (!env.GOOGLE_STT_CREDENTIALS_JSON && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.GOOGLE_STT_PROJECT_ID) {
      throw new SttProviderError(this.provider, "GOOGLE_STT_CREDENTIALS_MISSING", "Google credentials are missing");
    }

    const languageCode = getGoogleLanguageCode(this.options.sourceLanguage);
    const client = new SpeechClient(getGoogleClientOptions());

    debugInfo("[stt:google] stream connecting", {
      sessionId: this.options.sessionId,
      sourceLanguage: this.options.sourceLanguage,
      languageCode,
      model: env.GOOGLE_STT_MODEL,
      interimResults: env.GOOGLE_STT_INTERIM_RESULTS,
      mimeType: this.options.mimeType
    });

    this.stream = client
      .streamingRecognize({
        config: {
          encoding: getAudioEncoding(this.options.mimeType),
          sampleRateHertz: 48000,
          languageCode,
          model: env.GOOGLE_STT_MODEL,
          enableAutomaticPunctuation: true
        },
        interimResults: env.GOOGLE_STT_INTERIM_RESULTS
      })
      .on("data", (data: GoogleStreamingRecognizeResponse) => {
        const result = data.results?.[0];
        const alternative = result?.alternatives?.[0];
        const text = alternative?.transcript?.trim() ?? "";
        if (!text) return;

        debugInfo("[stt:google] transcript received", {
          sessionId: this.options.sessionId,
          isFinal: Boolean(result?.isFinal),
          confidence: alternative?.confidence,
          textLength: text.length
        });

        this.options.onTranscript({
          text,
          isFinal: Boolean(result?.isFinal),
          confidence: alternative?.confidence,
          provider: this.provider
        });
      })
      .on("error", (error: Error) => {
        console.error("[stt:google] stream error", {
          sessionId: this.options.sessionId,
          message: error.message
        });
        this.options.onError(error);
      })
      .on("end", () => {
        this.isOpen = false;
        debugInfo("[stt:google] stream ended", { sessionId: this.options.sessionId });
        this.options.onClose();
      }) as GoogleRecognizeStream;

    this.isOpen = true;
    for (const audio of this.pendingAudio.splice(0)) {
      this.stream.write(audio);
    }
  }

  send(audio: Buffer) {
    if (audio.byteLength === 0) return;
    if (!this.stream || !this.isOpen) {
      this.pendingAudio = [...this.pendingAudio.slice(-20), audio];
      return;
    }
    this.stream.write(audio);
  }

  stop() {
    if (!this.stream) return;
    this.stream.end();
    this.stream = null;
    this.isOpen = false;
    this.pendingAudio = [];
  }
}
