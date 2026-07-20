"use client";

import { ArrowRight, Languages, Mic2, Minimize2, TriangleAlert } from "lucide-react";
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

type StageVisualState = "idle" | "ready" | "listening" | "transcribing" | "translating" | "error";

function AudioLevelVisual({ level, label }: { level: number; label: string }) {
  const normalizedLevel = Math.max(0, Math.min(1, level));
  const hasSignal = normalizedLevel > 0.008;
  const barShape = [0.45, 0.7, 0.9, 1, 0.82, 0.62, 0.38];

  return (
    <div
      className="grid h-20 w-20 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.06]"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalizedLevel * 100)}
    >
      {hasSignal ? (
        <div className="flex h-10 items-center justify-center gap-1.5" aria-hidden="true">
          {barShape.map((shape, index) => (
            <span
              key={index}
              className="w-1.5 rounded-full bg-cyan-300 transition-[height] duration-75"
              style={{ height: `${Math.max(5, Math.round(normalizedLevel * shape * 38))}px` }}
            />
          ))}
        </div>
      ) : (
        <Mic2 className="h-8 w-8 text-cyan-200" aria-hidden="true" />
      )}
    </div>
  );
}

function StageStateIcon({ state, audioLevel, copy }: { state: StageVisualState; audioLevel: number; copy: UiCopy }) {
  if (state === "listening" || state === "transcribing") {
    return <AudioLevelVisual level={audioLevel} label={copy.inputLevel} />;
  }

  const isReady = state === "ready";

  return (
    <div
      className={cn(
        "relative grid h-20 w-20 place-items-center rounded-full border bg-slate-950/70",
        state === "error"
          ? "border-rose-300/25 text-rose-200"
          : "border-cyan-300/20 text-cyan-200 ring-1 ring-violet-400/10"
      )}
      aria-hidden="true"
    >
      {state === "error" ? (
        <TriangleAlert className="h-8 w-8" />
      ) : state === "idle" || state === "translating" ? (
        <Languages className="h-8 w-8" />
      ) : (
        <Mic2 className="h-8 w-8" />
      )}
      {isReady ? (
        <span className="absolute bottom-2.5 right-2.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
      ) : null}
    </div>
  );
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
  const showPendingIndicator = Boolean(isTranslationPending || liveSegment?.translationStatus === "pending");
  const previousTranslations = segments
    .filter((segment) => segment.isFinal && segment.translatedText && segment.translatedText !== displayTranslation)
    .slice(-1);
  const sourceLabel = session ? getLocalizedLanguageLabel(session.sourceLanguage, copy) : null;
  const targetLabel = session ? getLocalizedLanguageLabel(session.targetLanguage, copy) : null;
  const isReconnecting = connectionState === "connecting" || connectionState === "reconnecting";
  const hasError = connectionState === "error" || session?.status === "error";
  const isTranscribing = Boolean(isRecording && interimSegment?.text && !isTranslationPending);

  const stageState: StageVisualState = hasError
    ? "error"
    : !session
      ? "idle"
      : showPendingIndicator
        ? "translating"
        : isTranscribing
          ? "transcribing"
          : isRecording
            ? "listening"
            : "ready";

  const emptyTitle = stageState === "error"
    ? copy.centerStageErrorTitle
    : stageState === "translating"
      ? copy.translationInProgress
      : stageState === "transcribing"
        ? copy.transcribingStatus
        : !session
          ? copy.readyToTranslate
          : isRecording
            ? copy.listeningTitle
            : copy.microphoneReadyTitle;
  const emptyDescription = stageState === "error"
    ? copy.centerStageErrorDescription
    : stageState === "translating"
      ? copy.translationPreparingDescription
      : !session
        ? copy.readyToTranslateDescription
        : isRecording
          ? audioLevel > 0.008
            ? copy.listeningDescription
            : copy.waitingForAudioSignal
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
        <div className="flex items-center justify-end gap-2">
          {hasError ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-300/10 px-2.5 py-1 text-[0.68rem] font-bold text-rose-100">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.globalStatusError}
            </span>
          ) : showPendingIndicator ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-300/10 px-2.5 py-1 text-[0.68rem] font-bold text-violet-100">
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.translationInProgress}
            </span>
          ) : null}
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
      </div>

      <div className="relative flex-1 overflow-hidden px-5 sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(14,165,233,0.13),transparent_32rem),linear-gradient(145deg,#020617_0%,#0a1830_52%,#101827_100%)]" />
        <div
          className={cn(
            "absolute inset-x-5 z-10 mx-auto grid max-w-6xl -translate-y-1/2 gap-5 text-center sm:inset-x-10 lg:inset-x-14",
            displayTranslation
              ? isFocusMode
                ? "top-[65%]"
                : "top-[59%]"
              : !session
                ? "top-[46%]"
                : "top-1/2"
          )}
        >
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
            </>
          ) : (
            <div className="mx-auto grid max-w-2xl justify-items-center gap-3">
              <StageStateIcon state={stageState} audioLevel={audioLevel} copy={copy} />
              <p className="font-display text-3xl font-semibold text-white sm:text-5xl">{emptyTitle}</p>
              <p className="text-base leading-7 text-slate-400">{emptyDescription}</p>
              {!session ? (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                  <span>{copy.readyStepSession}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-cyan-300/70" aria-hidden="true" />
                  <span>{copy.microphone}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-violet-300/70" aria-hidden="true" />
                  <span>{copy.readyStepSpeak}</span>
                </div>
              ) : null}
              {session && sourceLabel && targetLabel ? (
                <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                  {sourceLabel}<ArrowRight className="h-3.5 w-3.5 text-cyan-300" />{targetLabel}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-10 border-t border-white/10 bg-white/[0.02] px-4 py-2">
        {previousTranslations.length > 0 ? (
          <div className="grid text-center">
            {previousTranslations.map((segment) => (
              <p key={segment.id} className="truncate text-xs text-slate-600">{segment.translatedText}</p>
            ))}
          </div>
        ) : session ? (
          <p className="text-center text-[0.68rem] text-slate-700">{copy.finalSnippets}</p>
        ) : null}
      </div>
    </section>
  );
}
