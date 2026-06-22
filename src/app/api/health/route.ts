import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "live-transcription-platform",
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
