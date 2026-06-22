import { NextResponse } from "next/server";
import { sessionStore } from "@/server/sessions";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    session,
    transcript: sessionStore.getTranscript(sessionId)
  });
}
