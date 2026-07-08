import { z } from "zod";

function isUrlList(value: string) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 && origins.every((origin) => z.string().url().safeParse(origin).success);
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}, z.boolean());

const envSchema = z.object({
  DEEPGRAM_API_KEY: z.string().min(1, "DEEPGRAM_API_KEY is required"),
  OPENAI_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().refine(isUrlList, "NEXT_PUBLIC_APP_URL must be a URL or comma-separated URL list").default("http://localhost:3000"),
  STT_PROVIDER: z.enum(["deepgram", "google", "openai", "auto"]).default("deepgram"),
  STT_AUTO_FALLBACK: booleanFromEnv.default(true),
  DEEPGRAM_MODEL: z.string().min(1).default("nova-3"),
  DEEPGRAM_ENDPOINTING_MS: z.coerce.number().int().min(10).max(1000).default(60),
  GOOGLE_STT_ENABLED: booleanFromEnv.default(false),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_STT_CREDENTIALS_JSON: z.string().optional(),
  GOOGLE_STT_PROJECT_ID: z.string().optional(),
  GOOGLE_STT_LOCATION: z.string().min(1).default("global"),
  GOOGLE_STT_RECOGNIZER: z.string().min(1).default("_"),
  GOOGLE_STT_MODEL: z.string().min(1).default("chirp_3"),
  GOOGLE_STT_LANGUAGE_CODE: z.string().min(1).default("uz-UZ"),
  GOOGLE_STT_INTERIM_RESULTS: booleanFromEnv.default(true),
  OPENAI_STT_ENABLED: booleanFromEnv.default(false),
  OPENAI_STT_MODEL: z.string().min(1).default("gpt-realtime-whisper"),
  INTERIM_TRANSLATION_ENABLED: booleanFromEnv.default(true),
  INTERIM_TRANSLATION_MIN_CHARS: z.coerce.number().int().min(1).max(200).default(8),
  INTERIM_TRANSLATION_MIN_INTERVAL_MS: z.coerce.number().int().min(50).max(5000).default(350),
  INTERIM_TRANSLATION_STABILITY_MS: z.coerce.number().int().min(100).max(3000).default(400),
  SUBTITLE_MIN_DISPLAY_MS: z.coerce.number().int().min(250).max(5000).default(1000),
  SUBTITLE_MAX_CHARS: z.coerce.number().int().min(40).max(300).default(120),
  FINAL_TRANSLATION_DEBOUNCE_MS: z.coerce.number().int().min(0).max(5000).default(120),
  OPENAI_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().min(500).max(10000).default(1800),
  OPENAI_TRANSLATION_MAX_TOKENS: z.coerce.number().int().min(20).max(300).default(70)
});

export type ServerEnv = z.infer<typeof envSchema>;

function hasUsableSecret(value: string | undefined, placeholder: string) {
  return Boolean(value && value.trim() && value !== placeholder);
}

function describeSecret(value: string | undefined, placeholder: string) {
  const present = hasUsableSecret(value, placeholder);
  const normalized = value?.trim() ?? "";

  return {
    present,
    preview: present ? `${normalized.slice(0, 3)}***` : "missing",
    length: present ? normalized.length : 0
  };
}

export function getEnvDiagnostics() {
  const deepgram = describeSecret(process.env.DEEPGRAM_API_KEY, "your_deepgram_api_key");
  const openai = describeSecret(process.env.OPENAI_API_KEY, "your_openai_api_key");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const issues: string[] = [];

  if (!deepgram.present) issues.push("Deepgram API key is missing");
  if (!isUrlList(appUrl)) {
    issues.push("NEXT_PUBLIC_APP_URL must include protocol, for example https://live-transcription-platform-production.up.railway.app");
  }

  return {
    ok: issues.length === 0,
    issues,
    deepgram: {
      ...deepgram,
      plausibleFormat: deepgram.present ? deepgram.length >= 20 : false
    },
    openai: {
      ...openai,
      plausibleFormat: openai.present ? openai.preview.startsWith("sk-") : false
    },
    appUrl,
    sttProvider: process.env.STT_PROVIDER ?? "deepgram",
    sttAutoFallback: process.env.STT_AUTO_FALLBACK ?? true,
    deepgramModel: process.env.DEEPGRAM_MODEL ?? "nova-3",
    deepgramEndpointingMs: process.env.DEEPGRAM_ENDPOINTING_MS ?? 60,
    googleSttEnabled: process.env.GOOGLE_STT_ENABLED ?? false,
    googleSttConfigured: Boolean(
      process.env.GOOGLE_STT_ENABLED === "true" &&
        (process.env.GOOGLE_STT_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_STT_PROJECT_ID)
    ),
    googleSttProjectIdPresent: Boolean(process.env.GOOGLE_STT_PROJECT_ID),
    googleSttCredentialsPresent: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    googleSttCredentialsJsonPresent: Boolean(process.env.GOOGLE_STT_CREDENTIALS_JSON),
    googleSttLocation: process.env.GOOGLE_STT_LOCATION ?? "global",
    googleSttRecognizer: process.env.GOOGLE_STT_RECOGNIZER ?? "_",
    googleSttModel: process.env.GOOGLE_STT_MODEL ?? "chirp_3",
    googleSttLanguageCode: process.env.GOOGLE_STT_LANGUAGE_CODE ?? "uz-UZ",
    googleSttInterimResults: process.env.GOOGLE_STT_INTERIM_RESULTS ?? true,
    openaiSttEnabled: process.env.OPENAI_STT_ENABLED ?? false,
    openaiSttModel: process.env.OPENAI_STT_MODEL ?? "gpt-realtime-whisper",
    interimTranslationEnabled: process.env.INTERIM_TRANSLATION_ENABLED ?? true,
    interimTranslationMinChars: process.env.INTERIM_TRANSLATION_MIN_CHARS ?? 8,
    interimTranslationMinIntervalMs: process.env.INTERIM_TRANSLATION_MIN_INTERVAL_MS ?? 350,
    interimTranslationStabilityMs: process.env.INTERIM_TRANSLATION_STABILITY_MS ?? 400,
    subtitleMinDisplayMs: process.env.SUBTITLE_MIN_DISPLAY_MS ?? 1000,
    subtitleMaxChars: process.env.SUBTITLE_MAX_CHARS ?? 120,
    finalTranslationDebounceMs: process.env.FINAL_TRANSLATION_DEBOUNCE_MS ?? 120,
    openaiTranslationEnabled: openai.present,
    openaiTimeoutMs: process.env.OPENAI_TRANSLATION_TIMEOUT_MS ?? 1800,
    openaiMaxTokens: process.env.OPENAI_TRANSLATION_MAX_TOKENS ?? 70
  };
}

export function logEnvDiagnostics(context: string) {
  const diagnostics = getEnvDiagnostics();
  console.info(`[env] ${context}`, {
    ok: diagnostics.ok,
    issues: diagnostics.issues,
    deepgram: diagnostics.deepgram,
    openai: diagnostics.openai,
    openaiTranslationEnabled: diagnostics.openaiTranslationEnabled,
    appUrl: diagnostics.appUrl,
    sttProvider: diagnostics.sttProvider,
    sttAutoFallback: diagnostics.sttAutoFallback,
    deepgramModel: diagnostics.deepgramModel,
    deepgramEndpointingMs: diagnostics.deepgramEndpointingMs,
    googleSttEnabled: diagnostics.googleSttEnabled,
    googleSttConfigured: diagnostics.googleSttConfigured,
    googleSttProjectIdPresent: diagnostics.googleSttProjectIdPresent,
    googleSttCredentialsPresent: diagnostics.googleSttCredentialsPresent,
    googleSttCredentialsJsonPresent: diagnostics.googleSttCredentialsJsonPresent,
    googleSttLocation: diagnostics.googleSttLocation,
    googleSttRecognizer: diagnostics.googleSttRecognizer,
    googleSttModel: diagnostics.googleSttModel,
    googleSttLanguageCode: diagnostics.googleSttLanguageCode,
    googleSttInterimResults: diagnostics.googleSttInterimResults,
    openaiSttEnabled: diagnostics.openaiSttEnabled,
    openaiSttModel: diagnostics.openaiSttModel,
    interimTranslationEnabled: diagnostics.interimTranslationEnabled,
    interimTranslationMinChars: diagnostics.interimTranslationMinChars,
    interimTranslationMinIntervalMs: diagnostics.interimTranslationMinIntervalMs,
    interimTranslationStabilityMs: diagnostics.interimTranslationStabilityMs,
    subtitleMinDisplayMs: diagnostics.subtitleMinDisplayMs,
    subtitleMaxChars: diagnostics.subtitleMaxChars,
    finalTranslationDebounceMs: diagnostics.finalTranslationDebounceMs,
    openaiTimeoutMs: diagnostics.openaiTimeoutMs,
    openaiMaxTokens: diagnostics.openaiMaxTokens
  });
  return diagnostics;
}

export function getServerEnv(): ServerEnv {
  const diagnostics = getEnvDiagnostics();
  if (!diagnostics.ok) {
    throw new Error(diagnostics.issues.join(", "));
  }

  const parsed = envSchema.safeParse({
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    STT_PROVIDER: process.env.STT_PROVIDER ?? "deepgram",
    STT_AUTO_FALLBACK: process.env.STT_AUTO_FALLBACK ?? true,
    DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL ?? "nova-3",
    DEEPGRAM_ENDPOINTING_MS: process.env.DEEPGRAM_ENDPOINTING_MS ?? 60,
    GOOGLE_STT_ENABLED: process.env.GOOGLE_STT_ENABLED ?? false,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_STT_CREDENTIALS_JSON: process.env.GOOGLE_STT_CREDENTIALS_JSON,
    GOOGLE_STT_PROJECT_ID: process.env.GOOGLE_STT_PROJECT_ID,
    GOOGLE_STT_LOCATION: process.env.GOOGLE_STT_LOCATION ?? "global",
    GOOGLE_STT_RECOGNIZER: process.env.GOOGLE_STT_RECOGNIZER ?? "_",
    GOOGLE_STT_MODEL: process.env.GOOGLE_STT_MODEL ?? "chirp_3",
    GOOGLE_STT_LANGUAGE_CODE: process.env.GOOGLE_STT_LANGUAGE_CODE ?? "uz-UZ",
    GOOGLE_STT_INTERIM_RESULTS: process.env.GOOGLE_STT_INTERIM_RESULTS ?? true,
    OPENAI_STT_ENABLED: process.env.OPENAI_STT_ENABLED ?? false,
    OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL ?? "gpt-realtime-whisper",
    INTERIM_TRANSLATION_ENABLED: process.env.INTERIM_TRANSLATION_ENABLED ?? true,
    INTERIM_TRANSLATION_MIN_CHARS: process.env.INTERIM_TRANSLATION_MIN_CHARS ?? 8,
    INTERIM_TRANSLATION_MIN_INTERVAL_MS: process.env.INTERIM_TRANSLATION_MIN_INTERVAL_MS ?? 350,
    INTERIM_TRANSLATION_STABILITY_MS: process.env.INTERIM_TRANSLATION_STABILITY_MS ?? 400,
    SUBTITLE_MIN_DISPLAY_MS: process.env.SUBTITLE_MIN_DISPLAY_MS ?? 1000,
    SUBTITLE_MAX_CHARS: process.env.SUBTITLE_MAX_CHARS ?? 120,
    FINAL_TRANSLATION_DEBOUNCE_MS: process.env.FINAL_TRANSLATION_DEBOUNCE_MS ?? 120,
    OPENAI_TRANSLATION_TIMEOUT_MS: process.env.OPENAI_TRANSLATION_TIMEOUT_MS ?? 1800,
    OPENAI_TRANSLATION_MAX_TOKENS: process.env.OPENAI_TRANSLATION_MAX_TOKENS ?? 70
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(message);
  }

  return parsed.data;
}
