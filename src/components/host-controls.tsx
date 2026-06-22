"use client";

import { useEffect } from "react";
import { Mic, Radio, Square } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import type { ConnectionState, SessionSummary } from "@/shared/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { LanguageSelect } from "./language-select";
import { SessionDetails } from "./session-details";

export type BroadcasterStatus = "idle" | "creating" | "ready" | "recording" | "stopped" | "error";

interface HostControlsProps {
  title: string;
  sourceLanguage: LanguageCode;
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
  onCreateSession: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onLeaveSession: () => void;
}

export function HostControls({
  title,
  sourceLanguage,
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
  onCreateSession,
  onStartRecording,
  onStopRecording,
  onLeaveSession
}: HostControlsProps) {
  const hasSession = Boolean(session);
  const isConnected = connectionState === "connected";
  const canCreate = !hasSession && !isCreating;
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
            ? `${copy.currentStatus}: ${status}.`
            : undefined;

  useEffect(() => {
    console.info("[frontend] broadcaster controls state", {
      hasSession,
      hasBroadcasterToken,
      connectionState,
      status,
      isRecording,
      canStart,
      startDisabledReason
    });
  }, [canStart, connectionState, hasBroadcasterToken, hasSession, isRecording, startDisabledReason, status]);

  const statusTone =
    status === "recording"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "ready" || status === "stopped"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-600";

  return (
    <section className="grid gap-4 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.broadcasterControls}</h2>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{copy.hostDescription}</p>
      </div>

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
        disabled={hasSession}
        onChange={onSourceLanguageChange}
      />

      {session ? <SessionDetails session={session} copy={copy} /> : null}

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/60">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.broadcasterStatus}</span>
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${statusTone}`}>
            <span className={`h-2 w-2 rounded-full ${isRecording ? "animate-pulse bg-rose-500" : isConnected ? "bg-emerald-500" : "bg-slate-400"}`} />
            {status}
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
        </div>
        {hasSession && !isRecording && !isConnected ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{copy.waitingConnection}</p>
        ) : null}
        {!canStart && hasSession && !isRecording ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{copy.startDisabled}: {startDisabledReason}</p>
        ) : null}
        {!hasSession && error ? (
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{copy.createNewSession}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {session ? (
          <Button type="button" variant="secondary" onClick={onLeaveSession} className="w-full">
            <Radio className="h-4 w-4" />
            {copy.endSession}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
