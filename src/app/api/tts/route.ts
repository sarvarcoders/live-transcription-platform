import { NextResponse } from "next/server";
import { z } from "zod";
import { getTtsStatus, synthesizeTranslatedSpeech, VoicePlaybackError } from "@/server/tts";

const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(getTtsStatus());
  } catch {
    return NextResponse.json({
      enabled: false,
      configured: false,
      model: "gpt-4o-mini-tts",
      voice: "coral",
      format: "mp3"
    });
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
      const status = error.code === "OPENAI_TTS_DISABLED" ? 403 : error.code === "OPENAI_TTS_NOT_CONFIGURED" ? 503 : 502;
      return jsonError(error.message, status, error.code);
    }

    return jsonError("OpenAI voice playback failed", 500, "OPENAI_TTS_FAILED");
  }
}
