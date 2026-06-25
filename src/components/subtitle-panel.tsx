"use client";

import { Captions, Maximize2, Minimize2, Radio } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import { getLanguageLabel } from "@/shared/languages";
import type { ConnectionState, SessionSummary, TranscriptSegment } from "@/shared/types";
import { cn } from "@/lib/utils";

interface SubtitlePanelProps {
  segments: TranscriptSegment[];
  interimSegment?: TranscriptSegment | null;
  lastDisplayedTranslation?: string | null;
  pendingTranslation?: TranscriptSegment | null;
  isTranslationPending?: boolean;
  lastFinalTranslation?: string | null;
  isRecording: boolean;
  connectionState: ConnectionState;
  session: SessionSummary | null;
  copy: UiCopy;
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
}

export function SubtitlePanel({
  segments,
  interimSegment,
  lastDisplayedTranslation,
  pendingTranslation,
  isTranslationPending,
  lastFinalTranslation,
  isRecording,
  connectionState,
  session,
  copy,
  isFocusMode,
  onToggleFocus
}: SubtitlePanelProps) {
  const liveSegment = pendingTranslation ?? interimSegment ?? segments.at(-1) ?? null;
  const recentSegments = segments.slice(-3);
  const isConnected = connectionState === "connected";
  const translationPending = "Tarjima qilinmoqda\u2026";
  const displayTranslation = lastDisplayedTranslation ?? lastFinalTranslation ?? null;
  const showPendingIndicator = Boolean(isTranslationPending || (liveSegment && !liveSegment.translatedText));

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950 shadow-2xl shadow-slate-950/25",
        isFocusMode ? "min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" : "min-h-[36rem] xl:min-h-[calc(100vh-8.25rem)]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.liveTranscript}</p>
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
          {onToggleFocus ? (
            <button
              type="button"
              onClick={onToggleFocus}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFocusMode ? copy.exitFocus : copy.focusMode}
            </button>
          ) : (
            <Captions className="h-5 w-5 text-cyan-200" />
          )}
        </div>
      </div>

      <div className="relative grid flex-1 place-items-center overflow-hidden px-5 py-8 sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.18),transparent_32rem),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-8 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />

        {liveSegment ? (
          <div className="relative mx-auto grid w-full max-w-7xl gap-5 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-400">
              <span>{formatTime(liveSegment.startedAt)}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{session ? getLanguageLabel(session.targetLanguage) : getLanguageLabel(liveSegment.targetLanguage)}</span>
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
            {displayTranslation ? (
              <p
                className={cn(
                  "mx-auto max-w-7xl text-balance text-5xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl",
                  liveSegment.translationStatus === "error" ? "text-rose-200" : "text-white"
                )}
              >
                {displayTranslation}
              </p>
            ) : null}
            {showPendingIndicator ? (
              <p className="mx-auto rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                {translationPending}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="relative grid gap-3 text-center">
            <p className="text-3xl font-semibold text-white sm:text-5xl">{copy.waitingForSpeech}</p>
            <p className="text-base text-slate-400">{copy.transcriptWillAppear}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-white/[0.025] px-4 py-3">
        {recentSegments.length > 0 ? (
          <div className="grid gap-1.5">
            {recentSegments.map((segment) => (
              <p key={segment.id} className="truncate rounded-lg px-3 py-1.5 text-sm text-slate-400">
                {segment.translatedText || translationPending}
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
