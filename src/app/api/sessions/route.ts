import { NextResponse } from "next/server";
import { z } from "zod";
import { isLanguageCode } from "@/shared/languages";
import { sessionStore } from "@/server/sessions";
import { logEnvDiagnostics } from "@/server/env";

const createSessionSchema = z.object({
  title: z.string().max(80).optional(),
  sourceLanguage: z.string().refine(isLanguageCode, "Unsupported source language"),
  targetLanguage: z.string().refine(isLanguageCode, "Unsupported target language").optional()
});

export async function GET() {
  return NextResponse.json({ sessions: sessionStore.list() });
}

export async function POST(request: Request) {
  try {
    console.info("[api] create session requested");
    const diagnostics = logEnvDiagnostics("create session");
    if (!diagnostics.ok) {
      return NextResponse.json({ error: diagnostics.issues[0], diagnostics }, { status: 503 });
    }

    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid session payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = sessionStore.create(parsed.data);
    console.info("[api] create session response", {
      sessionId: created.session.id,
      code: created.session.code,
      broadcasterTokenGenerated: Boolean(created.broadcasterToken)
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[api] create session failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  }
}
