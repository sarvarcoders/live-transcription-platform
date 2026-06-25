import { NextResponse } from "next/server";
import { z } from "zod";
import { getTtsStatus, streamTranslatedSpeech, synthesizeTranslatedSpeech, VoicePlaybackError } from "@/server/tts";

const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function voiceErrorStatus(error: VoicePlaybackError) {
  return error.code === "OPENAI_TTS_DISABLED" ? 403 : error.code === "OPENAI_TTS_NOT_CONFIGURED" ? 503 : 502;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const text = url.searchParams.get("text");
    if (text) {
      const parsed = ttsRequestSchema.safeParse({ text });
      if (!parsed.success) {
        return jsonError("Invalid voice playback request", 400, "OPENAI_TTS_FAILED");
      }

      const result = await streamTranslatedSpeech(parsed.data.text);
      return new Response(result.body, {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "no-store",
          "X-TTS-Cache": result.cached ? "hit" : "miss"
        }
      });
    }

    return NextResponse.json(getTtsStatus());
  } catch (error) {
    if (error instanceof VoicePlaybackError) {
      return jsonError(error.message, voiceErrorStatus(error), error.code);
    }

    return jsonError("OpenAI voice playback failed", 500, "OPENAI_TTS_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = ttsRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError("Invalid voice playback request", 400, "OPENAI_TTS_FAILED");
    }

    const result = await synthesizeTranslatedSpeech(parsed.data.text);
    return new Response(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof VoicePlaybackError) {
      return jsonError(error.message, voiceErrorStatus(error), error.code);
    }

    return jsonError("OpenAI voice playback failed", 500, "OPENAI_TTS_FAILED");
  }
}
