"use client";

import { Captions, Radio } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import { getLanguageLabel } from "@/shared/languages";
import type { ConnectionState, SessionSummary, TranscriptSegment } from "@/shared/types";
import { cn } from "@/lib/utils";

interface SubtitlePanelProps {
  segments: TranscriptSegment[];
  interimSegment?: TranscriptSegment | null;
  isRecording: boolean;
  connectionState: ConnectionState;
  session: SessionSummary | null;
  copy: UiCopy;
}

export function SubtitlePanel({ segments, interimSegment, isRecording, connectionState, session, copy }: SubtitlePanelProps) {
  const liveSegment = interimSegment ?? segments.at(-1) ?? null;
  const recentSegments = segments.slice(-3);
  const isConnected = connectionState === "connected";

  return (
    <section className="flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950 shadow-2xl shadow-slate-950/20 xl:min-h-[calc(100vh-10rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.liveTranscript}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{copy.mainSubtitleScreen}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
              isRecording
                ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
                : isConnected
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-300"
            )}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                isRecording ? "animate-pulse bg-rose-400" : isConnected ? "bg-emerald-400" : "bg-slate-500"
              )}
            />
            {isRecording ? copy.live : isConnected ? copy.connected : copy.standby}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
            <Radio className="h-3.5 w-3.5" />
            {session ? getLanguageLabel(session.sourceLanguage) : copy.noSession}
          </span>
          <Captions className="h-5 w-5 text-cyan-200" />
        </div>
      </div>

      <div className="relative grid flex-1 place-items-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(34,211,238,0.16),transparent_34rem)]" />
        <div className="pointer-events-none absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />

        {liveSegment ? (
          <div className="relative mx-auto grid w-full max-w-5xl gap-6 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-400">
              <span>{formatTime(liveSegment.startedAt)}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{getLanguageLabel(liveSegment.sourceLanguage)}</span>
              {!liveSegment.isFinal ? (
                <span className="rounded-full bg-amber-300/15 px-2.5 py-1 font-bold uppercase tracking-wide text-amber-100">
                  {copy.interim}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 font-bold uppercase tracking-wide text-emerald-100">
                  {copy.final}
                </span>
              )}
            </div>
            <p className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
              {liveSegment.text}
            </p>
          </div>
        ) : (
          <div className="relative grid gap-3 text-center">
            <p className="text-3xl font-semibold text-white sm:text-5xl">{copy.waitingForSpeech}</p>
            <p className="text-base text-slate-400">{copy.transcriptWillAppear}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-white/[0.03] px-5 py-4">
        {recentSegments.length > 0 ? (
          <div className="grid gap-2">
            {recentSegments.map((segment) => (
              <p key={segment.id} className="truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
                {segment.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">{copy.finalSnippets}</p>
        )}
      </div>
    </section>
  );
}
