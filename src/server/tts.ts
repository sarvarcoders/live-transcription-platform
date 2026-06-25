import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getServerEnv } from "./env";

const MAX_TTS_CACHE_SIZE = 200;
const ttsCache = new Map<string, { audio: Buffer; contentType: string }>();
let ttsClient: OpenAI | null = null;

export class VoicePlaybackError extends Error {
  code: "OPENAI_TTS_DISABLED" | "OPENAI_TTS_NOT_CONFIGURED" | "OPENAI_TTS_FAILED";

  constructor(code: VoicePlaybackError["code"], message: string) {
    super(message);
    this.name = "VoicePlaybackError";
    this.code = code;
  }
}

export function getTtsContentType(format: string) {
  switch (format) {
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/opus";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function getTtsClient() {
  if (!ttsClient) {
    const env = getServerEnv();
    if (!env.OPENAI_API_KEY) {
      throw new VoicePlaybackError("OPENAI_TTS_NOT_CONFIGURED", "OpenAI voice playback is not configured");
    }

    ttsClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TRANSLATION_TIMEOUT_MS,
      maxRetries: 0
    });
  }

  return ttsClient;
}

function cacheKey(input: { text: string; model: string; voice: string; format: string }) {
  return createHash("sha256")
    .update(`${input.model}:${input.voice}:${input.format}:${input.text.trim().toLocaleLowerCase()}`)
    .digest("hex");
}

function assertTtsReady(normalizedText: string) {
  const env = getServerEnv();

  if (!env.OPENAI_TTS_ENABLED) {
    throw new VoicePlaybackError("OPENAI_TTS_DISABLED", "OpenAI voice playback is disabled");
  }

  if (!env.OPENAI_API_KEY) {
    throw new VoicePlaybackError("OPENAI_TTS_NOT_CONFIGURED", "OpenAI voice playback is not configured");
  }

  if (!normalizedText) {
    throw new VoicePlaybackError("OPENAI_TTS_FAILED", "No translated text was provided for voice playback");
  }

  return env;
}

function remember(key: string, value: { audio: Buffer; contentType: string }) {
  ttsCache.set(key, value);

  if (ttsCache.size > MAX_TTS_CACHE_SIZE) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey) ttsCache.delete(firstKey);
  }
}

export function getTtsStatus() {
  const env = getServerEnv();
  return {
    enabled: env.OPENAI_TTS_ENABLED,
    configured: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_TTS_MODEL,
    voice: env.OPENAI_TTS_VOICE,
    format: env.OPENAI_TTS_FORMAT
  };
}

export async function synthesizeTranslatedSpeech(text: string) {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  const env = assertTtsReady(normalizedText);

  const key = cacheKey({
    text: normalizedText,
    model: env.OPENAI_TTS_MODEL,
    voice: env.OPENAI_TTS_VOICE,
    format: env.OPENAI_TTS_FORMAT
  });
  const cached = ttsCache.get(key);
  if (cached) return cached;

  try {
    const response = await getTtsClient().audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input: normalizedText,
      response_format: env.OPENAI_TTS_FORMAT,
      instructions: "Speak natural Uzbek clearly and calmly for live subtitles."
    });
    const audio = Buffer.from(await response.arrayBuffer());
    const result = {
      audio,
      contentType: getTtsContentType(env.OPENAI_TTS_FORMAT)
    };
    remember(key, result);
    return result;
  } catch (error) {
    if (error instanceof VoicePlaybackError) throw error;
    throw new VoicePlaybackError("OPENAI_TTS_FAILED", "OpenAI voice playback failed");
  }
}

export async function streamTranslatedSpeech(text: string) {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  const env = assertTtsReady(normalizedText);
  const key = cacheKey({
    text: normalizedText,
    model: env.OPENAI_TTS_MODEL,
    voice: env.OPENAI_TTS_VOICE,
    format: env.OPENAI_TTS_FORMAT
  });
  const cached = ttsCache.get(key);
  if (cached) {
    return {
      body: new Uint8Array(cached.audio),
      contentType: cached.contentType,
      cached: true
    };
  }

  try {
    const startedAt = Date.now();
    console.info("[tts] TTS request started", {
      textLength: normalizedText.length,
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      format: env.OPENAI_TTS_FORMAT
    });
    const response = await getTtsClient().audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input: normalizedText,
      response_format: env.OPENAI_TTS_FORMAT,
      instructions: "Speak natural Uzbek clearly and calmly for live subtitles."
    });
    let sawFirstByte = false;
    const chunks: Uint8Array[] = [];
    const contentType = getTtsContentType(env.OPENAI_TTS_FORMAT);
    const body = response.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (!sawFirstByte) {
            sawFirstByte = true;
            console.info("[tts] first audio byte received", {
              latencyMs: Date.now() - startedAt
            });
          }
          chunks.push(chunk);
          controller.enqueue(chunk);
        },
        flush() {
          const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const audio = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalLength);
          remember(key, { audio, contentType });
          console.info("[tts] full audio loaded", {
            totalLatencyMs: Date.now() - startedAt,
            bytes: totalLength
          });
        }
      })
    );

    if (!body) {
      const audio = Buffer.from(await response.arrayBuffer());
      remember(key, { audio, contentType });
      return {
        body: new Uint8Array(audio),
        contentType,
        cached: false
      };
    }

    return {
      body,
      contentType,
      cached: false
    };
  } catch (error) {
    if (error instanceof VoicePlaybackError) throw error;
    throw new VoicePlaybackError("OPENAI_TTS_FAILED", "OpenAI voice playback failed");
  }
}
