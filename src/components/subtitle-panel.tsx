"use client";

import { Captions, Maximize2, Minimize2, Radio, Sparkles } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import { formatTime } from "@/lib/utils";
import type { ActiveSttProvider, ConnectionState, SessionSummary, TranscriptSegment } from "@/shared/types";
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
  selectedSttProvider?: ActiveSttProvider | null;
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
  selectedSttProvider,
  copy,
  isFocusMode,
  onToggleFocus
}: SubtitlePanelProps) {
  const liveSegment = pendingTranslation ?? interimSegment ?? segments.at(-1) ?? null;
  const recentSegments = segments.slice(-3);
  const isConnected = connectionState === "connected";
  const translationPending = copy.translationInProgress;
  const displayTranslation = lastDisplayedTranslation ?? lastFinalTranslation ?? null;
  const showPendingIndicator = Boolean(isTranslationPending || (liveSegment && !liveSegment.translatedText));
  const activeProvider = selectedSttProvider ?? session?.activeSttProvider;
  const providerLabel = activeProvider
    ? activeProvider === "google"
      ? copy.sttGoogle
      : activeProvider === "openai"
        ? copy.sttOpenai
        : activeProvider === "uzbekvoice"
          ? copy.sttUzbekVoice
          : copy.sttDeepgram
    : null;
  const isDeepgramUzbekTest = activeProvider === "deepgram" && session?.sourceLanguage === "uz";
  const isUzbekVoiceChunked = activeProvider === "uzbekvoice";

  return (
    <section
      className={cn(
        "glass-panel flex flex-col overflow-hidden rounded-[2rem] bg-slate-950/85 shadow-2xl shadow-slate-950/25",
        isFocusMode ? "min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]" : "min-h-[36rem] xl:min-h-[calc(100vh-8.25rem)]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-2xl">
        <div className="flex items-center gap-2">
          <span className="glass-icon grid h-9 w-9 place-items-center rounded-2xl text-cyan-100">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">{copy.liveTranscript}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
              isRecording
                ? "text-rose-100"
                : isConnected
                  ? "text-emerald-100"
                  : "text-slate-300"
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
          <span className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200">
            <Radio className="h-3.5 w-3.5" />
            {session ? getLocalizedLanguageLabel(session.sourceLanguage, copy) : copy.noSession}
          </span>
          {providerLabel ? (
            <span className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-cyan-100">
              STT: {providerLabel}{isDeepgramUzbekTest ? " / Uzbek test" : ""}{isUzbekVoiceChunked ? " / chunked" : ""}
            </span>
          ) : null}
          {onToggleFocus ? (
            <button
              type="button"
              onClick={onToggleFocus}
              className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,0.30),transparent_30rem),radial-gradient(circle_at_8%_82%,rgba(168,85,247,0.16),transparent_26rem),linear-gradient(135deg,#020617_0%,#0b1220_48%,#111827_100%)]" />
        <div className="pointer-events-none absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent" />
        <div className="pointer-events-none absolute left-1/2 top-12 h-44 w-3/5 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

        {liveSegment ? (
          <div className="relative mx-auto grid w-full max-w-7xl gap-5 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-300">
              <span>{formatTime(liveSegment.startedAt)}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{session ? getLocalizedLanguageLabel(session.targetLanguage, copy) : getLocalizedLanguageLabel(liveSegment.targetLanguage, copy)}</span>
              {!liveSegment.isFinal ? (
                <span className="glass-pill rounded-full px-2.5 py-1 font-bold uppercase tracking-wide text-amber-100">
                  {copy.interim}
                </span>
              ) : (
                <span className="glass-pill rounded-full px-2.5 py-1 font-bold uppercase tracking-wide text-emerald-100">
                  {copy.final}
                </span>
              )}
            </div>
            {displayTranslation ? (
              <p
                className={cn(
                  "mx-auto max-w-7xl text-balance text-5xl font-semibold leading-tight tracking-tight drop-shadow-[0_18px_55px_rgba(56,189,248,0.18)] sm:text-6xl lg:text-7xl xl:text-8xl",
                  liveSegment.translationStatus === "error" ? "text-rose-200" : "text-white"
                )}
              >
                {displayTranslation}
              </p>
            ) : null}
            {showPendingIndicator ? (
              <p className="glass-pill mx-auto rounded-full px-4 py-2 text-sm font-semibold text-cyan-100">
                {translationPending}
              </p>
            ) : null}
            {isUzbekVoiceChunked ? (
              <p className="mx-auto text-sm font-medium text-slate-400">{copy.uzbekVoiceLatencyNote}</p>
            ) : null}
          </div>
        ) : (
          <div className="relative grid gap-3 text-center">
            <p className="text-3xl font-semibold text-white sm:text-5xl">{copy.waitingForSpeech}</p>
            <p className="text-base text-slate-400">{copy.transcriptWillAppear}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-2xl">
        {recentSegments.length > 0 ? (
          <div className="grid gap-1.5">
            {recentSegments.map((segment) => (
              <p key={segment.id} className="glass-panel-soft truncate rounded-xl px-3 py-1.5 text-sm text-slate-300">
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
