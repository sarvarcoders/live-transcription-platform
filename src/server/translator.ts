import OpenAI from "openai";
import type { LanguageCode } from "@/shared/languages";
import { getLanguageLabel } from "@/shared/languages";
import { getServerEnv } from "./env";

const MAX_CACHE_SIZE = 600;
const translationCache = new Map<string, string>();
const pendingTranslations = new Map<string, Promise<string>>();
const pendingStreamingTranslations = new Map<string, Promise<string>>();
let openaiClient: OpenAI | null = null;

function getClient() {
  if (!openaiClient) {
    const env = getServerEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error("OpenAI translation is disabled.");
    }
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TRANSLATION_TIMEOUT_MS,
      maxRetries: 0
    });
  }

  return openaiClient;
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function cacheKey(sourceLanguage: LanguageCode, targetLanguage: LanguageCode, text: string) {
  return `${sourceLanguage}:${targetLanguage}:${normalizeText(text).toLocaleLowerCase()}`;
}

function remember(key: string, value: string) {
  translationCache.set(key, value);

  if (translationCache.size > MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
}

export function normalizeTranscriptText(text: string) {
  return normalizeText(text);
}

export function getTranslationCacheKey(input: {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}) {
  return cacheKey(input.sourceLanguage, input.targetLanguage, input.text);
}

export function getCachedTranslation(input: {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}) {
  return translationCache.get(getTranslationCacheKey(input));
}

export async function translateTranscript(input: {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}) {
  const normalizedText = normalizeText(input.text);
  if (!normalizedText) return "";
  if (input.sourceLanguage === input.targetLanguage) return normalizedText;

  const key = cacheKey(input.sourceLanguage, input.targetLanguage, normalizedText);
  const cached = translationCache.get(key);
  if (cached) return cached;

  const pending = pendingTranslations.get(key);
  if (pending) return pending;

  const sourceLabel = getLanguageLabel(input.sourceLanguage);
  const targetLabel = getLanguageLabel(input.targetLanguage);

  const request = getClient()
    .chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: "Translate live subtitles. Keep meaning, names, and numbers. Return only the translation."
        },
        {
          role: "user",
          content: `Translate from ${sourceLabel} to ${targetLabel}:\n${normalizedText}`
        }
      ]
    })
    .then((response) => {
      const translated = response.choices[0]?.message.content?.trim();
      if (!translated) throw new Error("OpenAI returned an empty translation.");
      remember(key, translated);
      return translated;
    })
    .finally(() => {
      pendingTranslations.delete(key);
    });

  pendingTranslations.set(key, request);
  return request;
}

export async function streamTranslateTranscript(input: {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceContext?: string;
  translationContext?: string;
  onToken: (partialText: string, token: string) => void;
  onFirstToken?: () => void;
}) {
  const env = getServerEnv();
  const normalizedText = normalizeText(input.text);
  if (!normalizedText) return "";
  if (input.sourceLanguage === input.targetLanguage) {
    input.onToken(normalizedText, normalizedText);
    input.onFirstToken?.();
    return normalizedText;
  }

  const key = cacheKey(input.sourceLanguage, input.targetLanguage, normalizedText);
  const cached = translationCache.get(key);
  if (cached) {
    input.onFirstToken?.();
    input.onToken(cached, cached);
    return cached;
  }

  const pending = pendingStreamingTranslations.get(key);
  if (pending) return pending;

  const sourceLabel = getLanguageLabel(input.sourceLanguage);
  const targetLabel = getLanguageLabel(input.targetLanguage);
  const context = input.sourceContext && input.translationContext
    ? `Previous source: ${input.sourceContext}\nPrevious translation: ${input.translationContext}\n`
    : "";

  const request = (async () => {
    const stream = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: env.OPENAI_TRANSLATION_MAX_TOKENS,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Translate live subtitle fragments. Use context only for continuity. Return only the translation for the new text."
        },
        {
          role: "user",
          content: `${context}Translate new ${sourceLabel} text to ${targetLabel}:\n${normalizedText}`
        }
      ]
    });

    let translated = "";
    let sawFirstToken = false;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (!token) continue;
      translated += token;
      if (!sawFirstToken) {
        sawFirstToken = true;
        input.onFirstToken?.();
      }
      input.onToken(translated.trimStart(), token);
    }

    const finalTranslation = translated.trim();
    if (!finalTranslation) throw new Error("OpenAI returned an empty translation.");
    remember(key, finalTranslation);
    return finalTranslation;
  })().finally(() => {
    pendingStreamingTranslations.delete(key);
  });

  pendingStreamingTranslations.set(key, request);
  return request;
}
