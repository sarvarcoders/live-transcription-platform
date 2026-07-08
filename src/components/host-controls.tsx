"use client";

import { ChevronDown, Cpu, Mic, Radio, Square } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import type { ConnectionState, SessionSummary, SttProvider } from "@/shared/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LanguageSelect } from "./language-select";
import { SessionDetails } from "./session-details";

export type BroadcasterStatus = "idle" | "creating" | "ready" | "recording" | "stopped" | "error";

interface HostControlsProps {
  title: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sttProvider: SttProvider;
  session: SessionSummary | null;
  isCreating: boolean;
  isRecording: boolean;
  hasBroadcasterToken: boolean;
  connectionState: ConnectionState;
  status: BroadcasterStatus;
  error?: string | null;
  copy: UiCopy;
  onTitleChange: (title: string) => void;
  onSourceLanguageChange: (language: LanguageCode) => void;
  onTargetLanguageChange: (language: LanguageCode) => void;
  onSttProviderChange: (provider: SttProvider) => void;
  onCreateSession: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onLeaveSession: () => void;
}

export function HostControls({
  title,
  sourceLanguage,
  targetLanguage,
  sttProvider,
  session,
  isCreating,
  isRecording,
  hasBroadcasterToken,
  connectionState,
  status,
  error,
  copy,
  onTitleChange,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onSttProviderChange,
  onCreateSession,
  onStartRecording,
  onStopRecording,
  onLeaveSession
}: HostControlsProps) {
  const hasSession = Boolean(session);
  const isConnected = connectionState === "connected";
  const canCreate = !hasSession && !isCreating;
  const statusLabels: Record<BroadcasterStatus, string> = {
    idle: copy.broadcasterIdle,
    creating: copy.broadcasterCreating,
    ready: copy.broadcasterReady,
    recording: copy.broadcasterRecording,
    stopped: copy.broadcasterStopped,
    error: copy.broadcasterError
  };
  const canStart =
    hasSession &&
    hasBroadcasterToken &&
    !isRecording &&
    isConnected &&
    (status === "ready" || status === "stopped") &&
    !error;
  const startDisabledReason = !hasSession
    ? copy.createFirst
    : !hasBroadcasterToken
      ? copy.missingToken
      : !isConnected
        ? copy.socketNotConnected
        : error
          ? copy.resolveError
          : !(status === "ready" || status === "stopped")
            ? `${copy.currentStatus}: ${statusLabels[status]}.`
            : undefined;

  const statusTone =
    status === "recording"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "ready" || status === "stopped"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-600";

  return (
    <section className="grid gap-3 rounded-2xl border border-white/70 bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {copy.sessionTitle}
        <Input
          value={title}
          disabled={hasSession}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={copy.sessionTitlePlaceholder}
        />
      </label>

      <LanguageSelect
        id="source-language"
        label={copy.speakerLanguage}
        value={sourceLanguage}
        copy={copy}
        disabled={hasSession}
        onChange={onSourceLanguageChange}
      />

      <LanguageSelect
        id="target-language"
        label={copy.targetLanguage}
        value={targetLanguage}
        copy={copy}
        disabled={hasSession}
        onChange={onTargetLanguageChange}
      />

      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="stt-provider">
        {copy.sttProvider}
        <span className="relative block">
          <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600 dark:text-cyan-300" />
          <select
            id="stt-provider"
            value={sttProvider}
            disabled={hasSession}
            onChange={(event) => onSttProviderChange(event.target.value as SttProvider)}
            className="w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-3 pl-10 pr-10 text-sm font-semibold text-slate-950 shadow-sm outline-none transition hover:border-brand-200 hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:hover:border-cyan-700 dark:focus:ring-brand-500/20 dark:disabled:bg-slate-900"
          >
            <option value="auto">{copy.sttAuto}</option>
            <option value="deepgram">{copy.sttDeepgram}</option>
            <option value="google">{copy.sttGoogle}</option>
            <option value="openai">{copy.sttOpenai}</option>
            <option value="uzbekvoice">{copy.sttUzbekVoice}</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </span>
      </label>

      {session ? <SessionDetails session={session} copy={copy} /> : null}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.status}</span>
        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${statusTone}`}>
          <span className={`h-2 w-2 rounded-full ${isRecording ? "animate-pulse bg-rose-500" : isConnected ? "bg-emerald-500" : "bg-slate-400"}`} />
          {statusLabels[status]}
        </span>
      </div>

      <div className="grid gap-2">
        <Button type="button" onClick={onCreateSession} disabled={!canCreate} className="w-full">
          {isCreating ? copy.creatingSession : hasSession ? copy.sessionReady : copy.createSession}
        </Button>

        {isRecording ? (
          <Button type="button" variant="danger" onClick={onStopRecording} className="w-full">
            <Square className="h-4 w-4" />
            {copy.stopRecording}
          </Button>
        ) : (
          <Button type="button" onClick={onStartRecording} disabled={!canStart} className="w-full">
            <Mic className="h-4 w-4" />
            {copy.startMicrophone}
          </Button>
        )}

        {session ? (
          <Button type="button" variant="secondary" onClick={onLeaveSession} className="w-full">
            <Radio className="h-4 w-4" />
            {copy.endSession}
          </Button>
        ) : null}
      </div>

      {hasSession && !isRecording && !isConnected ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{copy.waitingConnection}</p>
      ) : null}
      {!canStart && hasSession && !isRecording ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">{copy.startDisabled}: {startDisabledReason}</p>
      ) : null}
      {!hasSession && error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300">{copy.createNewSession}</p>
      ) : null}
    </section>
  );
}
