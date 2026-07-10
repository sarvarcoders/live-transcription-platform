import type { ActiveSttProvider, SttProvider } from "@/shared/types";
import type { LanguageCode } from "@/shared/languages";
import { getServerEnv } from "@/server/env";
import { DeepgramSttStream } from "./deepgram-provider";
import { GoogleSttStream } from "./google-provider";
import { OpenAiSttStream } from "./openai-provider";
import { UzbekVoiceChunkedSttStream } from "./uzbekvoice-provider";
import type { ProviderSelection, SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

export type { ProviderSelection, SttStream, SttStreamOptions, SttTranscript } from "./types";
export { SttProviderError } from "./types";

function normalizeRequestedProvider(provider?: SttProvider): SttProvider {
  return provider ?? getServerEnv().STT_PROVIDER;
}

export function selectSttProvider(sourceLanguage: LanguageCode, requested?: SttProvider): ProviderSelection {
  const requestedProvider = normalizeRequestedProvider(requested);

  if (requestedProvider === "deepgram") {
    return {
      requestedProvider,
      provider: "deepgram",
      fallbackReason:
        sourceLanguage === "uz" ? "Deepgram does not reliably support Uzbek speech. Use OpenAI STT." : undefined
    };
  }
  if (requestedProvider === "google") return { requestedProvider, provider: "google" };
  if (requestedProvider === "openai") return { requestedProvider, provider: "openai" };
  if (requestedProvider === "uzbekvoice") return { requestedProvider, provider: "uzbekvoice" };

  if (sourceLanguage === "uz") {
    return {
      requestedProvider,
      provider: "openai",
      fallbackReason: "Auto routing selected OpenAI STT for Uzbek speech"
    };
  }

  if (sourceLanguage === "en" || sourceLanguage === "ru") {
    return {
      requestedProvider,
      provider: "deepgram",
      fallbackReason: `Auto routing selected Deepgram for ${sourceLanguage} speech`
    };
  }

  return { requestedProvider, provider: "deepgram" };
}

export function canFallbackToDeepgram(provider: ActiveSttProvider, sourceLanguage?: LanguageCode, requestedProvider?: SttProvider) {
  const env = getServerEnv();
  if (sourceLanguage === "uz" && provider === "openai" && requestedProvider !== "deepgram") return false;
  return env.STT_AUTO_FALLBACK && provider !== "deepgram";
}

export function createSttStream(provider: ActiveSttProvider, options: SttStreamOptions): SttStream {
  if (provider === "deepgram") return new DeepgramSttStream(options);
  if (provider === "google") return new GoogleSttStream(options);
  if (provider === "uzbekvoice") return new UzbekVoiceChunkedSttStream(options);
  return new OpenAiSttStream(options);
}

export function classifySttError(provider: ActiveSttProvider, error: unknown) {
  if (error instanceof SttProviderError) {
    return { code: error.code, message: error.message, provider: error.provider };
  }

  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const message = normalizedError.message.toLowerCase();

  if (provider === "deepgram") {
    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("api key") ||
      message.includes("auth")
    ) {
      return {
        provider,
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
        provider,
        code: "DEEPGRAM_CONFIG_FAILED",
        message: "Deepgram model or language configuration failed"
      };
    }

    return {
      provider,
      code: "DEEPGRAM_STREAM_ERROR",
      message: `Deepgram connection failed: ${normalizedError.message}`
    };
  }

  if (provider === "google") {
    if (message.includes("quota") || message.includes("resource_exhausted") || message.includes("429")) {
      return { provider, code: "GOOGLE_STT_QUOTA_EXCEEDED", message: "Google STT quota exceeded" };
    }
    if (message.includes("permission") || message.includes("denied") || message.includes("403")) {
      return { provider, code: "GOOGLE_STT_PERMISSION_DENIED", message: "Google STT permission denied" };
    }
    if (message.includes("credential") || message.includes("auth") || message.includes("401")) {
      return { provider, code: "GOOGLE_STT_CREDENTIALS_MISSING", message: "Google credentials are missing" };
    }
    if (message.includes("model") || message.includes("language") || message.includes("invalid") || message.includes("400")) {
      return {
        provider,
        code: "GOOGLE_STT_CONFIG_FAILED",
        message: "Google STT model or language configuration failed"
      };
    }
    return { provider, code: "GOOGLE_STT_CONNECTION_FAILED", message: `Google STT connection failed: ${normalizedError.message}` };
  }

  if (provider === "uzbekvoice") {
    if (message.includes("not configured") || message.includes("api key") || message.includes("401") || message.includes("403")) {
      return { provider, code: "UZBEKVOICE_STT_NOT_CONFIGURED", message: "UzbekVoice STT is not configured." };
    }
    return {
      provider,
      code: "UZBEKVOICE_STT_FAILED",
      message: normalizedError.message.startsWith("UzbekVoice STT failed:")
        ? normalizedError.message
        : `UzbekVoice STT failed: ${normalizedError.message}`
    };
  }

  if (provider === "openai") {
    if (
      message.includes("not configured") ||
      message.includes("api key") ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return { provider, code: "OPENAI_STT_NOT_CONFIGURED", message: "OpenAI STT is not configured for Uzbek speech." };
    }

    if (message.includes("429") || message.includes("quota") || message.includes("billing")) {
      return { provider, code: "OPENAI_STT_FAILED", message: "OpenAI STT failed: quota exceeded or billing is not active" };
    }

    return {
      provider,
      code: "OPENAI_STT_FAILED",
      message: normalizedError.message.startsWith("OpenAI STT failed:")
        ? normalizedError.message
        : `OpenAI STT failed: ${normalizedError.message}`
    };
  }

  return { provider, code: "OPENAI_STT_FAILED", message: normalizedError.message };
}
