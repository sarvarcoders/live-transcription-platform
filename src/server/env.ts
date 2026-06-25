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
  DEEPGRAM_MODEL: z.string().min(1).default("nova-3"),
  DEEPGRAM_ENDPOINTING_MS: z.coerce.number().int().min(10).max(1000).default(60),
  INTERIM_TRANSLATION_ENABLED: booleanFromEnv.default(true),
  INTERIM_TRANSLATION_MIN_CHARS: z.coerce.number().int().min(1).max(200).default(4),
  INTERIM_TRANSLATION_MIN_INTERVAL_MS: z.coerce.number().int().min(50).max(5000).default(180),
  FINAL_TRANSLATION_DEBOUNCE_MS: z.coerce.number().int().min(0).max(5000).default(80),
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
    deepgramModel: process.env.DEEPGRAM_MODEL ?? "nova-3",
    deepgramEndpointingMs: process.env.DEEPGRAM_ENDPOINTING_MS ?? 60,
    interimTranslationEnabled: process.env.INTERIM_TRANSLATION_ENABLED ?? true,
    interimTranslationMinChars: process.env.INTERIM_TRANSLATION_MIN_CHARS ?? 4,
    interimTranslationMinIntervalMs: process.env.INTERIM_TRANSLATION_MIN_INTERVAL_MS ?? 180,
    finalTranslationDebounceMs: process.env.FINAL_TRANSLATION_DEBOUNCE_MS ?? 80,
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
    deepgramModel: diagnostics.deepgramModel,
    deepgramEndpointingMs: diagnostics.deepgramEndpointingMs,
    interimTranslationEnabled: diagnostics.interimTranslationEnabled,
    interimTranslationMinChars: diagnostics.interimTranslationMinChars,
    interimTranslationMinIntervalMs: diagnostics.interimTranslationMinIntervalMs,
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
    DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL ?? "nova-3",
    DEEPGRAM_ENDPOINTING_MS: process.env.DEEPGRAM_ENDPOINTING_MS ?? 60,
    INTERIM_TRANSLATION_ENABLED: process.env.INTERIM_TRANSLATION_ENABLED ?? true,
    INTERIM_TRANSLATION_MIN_CHARS: process.env.INTERIM_TRANSLATION_MIN_CHARS ?? 4,
    INTERIM_TRANSLATION_MIN_INTERVAL_MS: process.env.INTERIM_TRANSLATION_MIN_INTERVAL_MS ?? 180,
    FINAL_TRANSLATION_DEBOUNCE_MS: process.env.FINAL_TRANSLATION_DEBOUNCE_MS ?? 80,
    OPENAI_TRANSLATION_TIMEOUT_MS: process.env.OPENAI_TRANSLATION_TIMEOUT_MS ?? 1800,
    OPENAI_TRANSLATION_MAX_TOKENS: process.env.OPENAI_TRANSLATION_MAX_TOKENS ?? 70
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(message);
  }

  return parsed.data;
}
