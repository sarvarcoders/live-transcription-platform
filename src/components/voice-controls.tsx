"use client";

import { Square, Volume2, VolumeX } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VoiceControlsProps {
  isAvailable: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  isPlaying: boolean;
  isPreparing: boolean;
  queueLength: number;
  error?: string | null;
  copy: UiCopy;
  onToggle: (enabled: boolean) => void;
  onStop: () => void;
}

export function VoiceControls({
  isAvailable,
  isConfigured,
  isEnabled,
  isPlaying,
  isPreparing,
  queueLength,
  error,
  copy,
  onToggle,
  onStop
}: VoiceControlsProps) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{copy.voicePlayback}</h2>
        {isEnabled ? <Volume2 className="h-4 w-4 text-brand-600" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          disabled={!isAvailable}
          onClick={() => onToggle(!isEnabled)}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4",
            isEnabled
              ? "bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-200 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus:ring-white/20"
              : "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-100 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:focus:ring-cyan-400/20",
            !isAvailable && "cursor-not-allowed bg-slate-200 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-500"
          )}
        >
          {isEnabled ? copy.disableVoice : copy.enableVoice}
        </button>

        <button
          type="button"
          disabled={!isEnabled && !isPlaying && queueLength === 0}
          onClick={onStop}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <Square className="h-3.5 w-3.5" />
          {copy.stopVoice}
        </button>
      </div>

      <div className="mt-3 grid gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {!isAvailable ? <p>{isConfigured ? copy.voiceDisabled : copy.voiceUnavailable}</p> : null}
        {isPreparing ? <p>{copy.voicePreparing}</p> : null}
        {isPlaying ? <p>{copy.voicePlaying}</p> : null}
        {queueLength > 0 ? <p>{copy.voiceQueued}: {queueLength}</p> : null}
        {error ? <p className="text-rose-600 dark:text-rose-300">{error}</p> : null}
      </div>
    </section>
  );
}
