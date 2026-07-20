"use client";

import { AlertTriangle, Bot, CheckCircle2, Loader2, Mic, Radio, Sparkles, Wifi, WifiOff } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { ActiveSttProvider, ConnectionState } from "@/shared/types";
import type { MicrophoneUiStatus } from "./microphone-controls";
import { cn } from "@/lib/utils";

export type GlobalLiveStatusKind = "setup" | "creating" | "ready" | "listening" | "translating" | "reconnecting" | "paused" | "error";

interface GlobalLiveStatusProps {
  status: GlobalLiveStatusKind;
  connectionState: ConnectionState;
  microphoneStatus: MicrophoneUiStatus;
  provider: ActiveSttProvider | null;
  latencyMs?: number;
  copy: UiCopy;
}

export function GlobalLiveStatus({ status, connectionState, microphoneStatus, provider, latencyMs, copy }: GlobalLiveStatusProps) {
  const statusConfig = {
    setup: { label: copy.globalStatusSetup, Icon: Sparkles, tone: "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" },
    creating: { label: copy.globalStatusCreating, Icon: Loader2, tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200" },
    ready: { label: copy.globalStatusReady, Icon: CheckCircle2, tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200" },
    listening: { label: copy.globalStatusListening, Icon: Mic, tone: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200" },
    translating: { label: copy.globalStatusTranslating, Icon: Bot, tone: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200" },
    reconnecting: { label: copy.globalStatusReconnecting, Icon: Loader2, tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200" },
    paused: { label: copy.globalStatusPaused, Icon: Radio, tone: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" },
    error: { label: copy.globalStatusError, Icon: AlertTriangle, tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200" }
  }[status];
  const StatusIcon = statusConfig.Icon;
  const providerLabel = provider === "openai" ? copy.sttOpenai : provider === "deepgram" ? copy.sttDeepgram : provider === "uzbekvoice" ? copy.sttUzbekVoice : provider === "google" ? copy.sttGoogle : copy.notAvailable;
  const microphoneLabels: Record<MicrophoneUiStatus, string> = {
    unknown: copy.microphoneStatusUnknown,
    ready: copy.microphoneStatusReady,
    testing: copy.microphoneStatusTesting,
    active: copy.microphoneStatusActive,
    missing: copy.microphoneStatusMissing,
    blocked: copy.microphoneStatusBlocked
  };
  const socketLabel = connectionState === "connected" ? copy.connectionConnected : connectionState === "reconnecting" || connectionState === "connecting" ? copy.connectionReconnecting : connectionState === "error" ? copy.connectionError : copy.connectionDisconnected;

  return (
    <details className="group relative z-40">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold shadow-sm outline-none transition focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-500/20",
          statusConfig.tone
        )}
        title={copy.systemHealth}
      >
        <StatusIcon className={cn("h-4 w-4", (status === "creating" || status === "reconnecting" || status === "translating") && "animate-spin")} />
        {statusConfig.label}
      </summary>

      <div className="absolute right-0 top-full z-[1100] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{copy.systemHealth}</p>
        <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2">{connectionState === "connected" ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}{copy.websocket}</span><strong>{socketLabel}</strong></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><Mic className="h-3.5 w-3.5 text-cyan-500" />{copy.microphone}</span><strong>{microphoneLabels[microphoneStatus]}</strong></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-cyan-500" />{copy.sttEngine}</span><strong>{providerLabel}</strong></div>
          <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-violet-500" />{copy.translationService}</span><strong>OpenAI</strong></div>
          <div className="flex items-center justify-between gap-3"><span>{copy.currentLatency}</span><strong>{latencyMs == null ? copy.notAvailable : `${Math.round(latencyMs)} ms`}</strong></div>
        </div>
      </div>
    </details>
  );
}
