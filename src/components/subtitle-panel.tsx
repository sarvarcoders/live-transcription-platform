"use client";

import { ArrowRight, Minimize2 } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
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
  audioLevel?: number;
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
  audioLevel = 0,
  connectionState,
  session,
  copy,
  isFocusMode,
  onToggleFocus
}: SubtitlePanelProps) {
  const liveSegment = pendingTranslation ?? interimSegment ?? segments.at(-1) ?? null;
  const displayTranslation = lastDisplayedTranslation ?? lastFinalTranslation ?? null;
  const showPendingIndicator = Boolean(isTranslationPending || (liveSegment && !liveSegment.translatedText));
  const previousTranslations = segments
    .filter((segment) => segment.isFinal && segment.translatedText && segment.translatedText !== displayTranslation)
    .slice(-2);
  const sourceLabel = session ? getLocalizedLanguageLabel(session.sourceLanguage, copy) : null;
  const targetLabel = session ? getLocalizedLanguageLabel(session.targetLanguage, copy) : null;
  const isReconnecting = connectionState === "connecting" || connectionState === "reconnecting";

  const emptyTitle = !session
    ? copy.readyToTranslate
    : isRecording
      ? copy.listeningTitle
      : copy.microphoneReadyTitle;
  const emptyDescription = !session
    ? copy.readyToTranslateDescription
    : isRecording
      ? copy.listeningDescription
      : copy.startSpeakingDescription;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 shadow-2xl shadow-slate-950/25",
        isFocusMode ? "min-h-[calc(100vh-1rem)] rounded-none border-0 sm:min-h-[calc(100vh-2rem)] sm:rounded-2xl sm:border" : "min-h-[38rem] xl:min-h-[calc(100vh-7.25rem)]"
      )}
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">{copy.liveTranscript}</p>
        {isFocusMode && onToggleFocus ? (
          <button
            type="button"
            onClick={onToggleFocus}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            {copy.exitFocus}
          </button>
        ) : null}
      </div>

      <div className="relative flex flex-1 items-end justify-center overflow-hidden px-5 pb-[12%] pt-12 sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(14,165,233,0.13),transparent_32rem),linear-gradient(145deg,#020617_0%,#0a1830_52%,#101827_100%)]" />
        <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-5 text-center">
          {displayTranslation ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-400">
                {sourceLabel && targetLabel ? (
                  <span className="inline-flex items-center gap-2">
                    {sourceLabel}
                    <ArrowRight className="h-3.5 w-3.5 text-cyan-300" />
                    {targetLabel}
                  </span>
                ) : null}
                {isReconnecting ? <span className="text-amber-200">{copy.globalStatusReconnecting}</span> : null}
              </div>
              <p className="mx-auto max-w-5xl text-balance font-display text-4xl font-semibold leading-[1.12] text-white sm:text-5xl lg:text-6xl 2xl:text-7xl">
                {displayTranslation}
              </p>
              {showPendingIndicator ? (
                <p className="mx-auto rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-bold text-violet-100">
                  {copy.translationInProgress}
                </p>
              ) : null}
            </>
          ) : (
            <div className="mx-auto grid max-w-2xl gap-3">
              <p className="font-display text-3xl font-semibold text-white sm:text-5xl">{emptyTitle}</p>
              <p className="text-base leading-7 text-slate-400">{emptyDescription}</p>
              {session && sourceLabel && targetLabel ? (
                <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                  {sourceLabel}<ArrowRight className="h-3.5 w-3.5 text-cyan-300" />{targetLabel}
                </p>
              ) : null}
              {isRecording ? (
                <div className="mx-auto mt-2 w-full max-w-sm" role="meter" aria-label={copy.inputLevel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioLevel * 100)}>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-75" style={{ width: `${Math.max(0, Math.min(100, audioLevel * 100))}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-14 border-t border-white/10 bg-white/[0.025] px-4 py-3">
        {previousTranslations.length > 0 ? (
          <div className="grid gap-1 text-center">
            {previousTranslations.map((segment) => (
              <p key={segment.id} className="truncate text-sm text-slate-500">{segment.translatedText}</p>
            ))}
          </div>
        ) : (
          <p className="text-center text-xs text-slate-600">{session ? copy.finalSnippets : copy.readyToTranslateDescription}</p>
        )}
      </div>
    </section>
  );
}
