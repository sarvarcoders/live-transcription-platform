"use client";

import { Copy, Users } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import type { SessionSummary } from "@/shared/types";
import { Button } from "./ui/button";

export function SessionDetails({ session, copy }: { session: SessionSummary; copy: UiCopy }) {
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}?session=${session.code}`;
  const statusLabels = {
    waiting: copy.statusWaiting,
    live: copy.statusLive,
    ended: copy.statusEnded,
    error: copy.statusError,
    expired: copy.statusExpired
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/50">
      <div className="grid gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.sessionCode}</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{session.code}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(shareUrl || session.id)}
          className="w-full"
        >
          <Copy className="h-4 w-4" />
          {copy.copyLink}
        </Button>
      </div>
      <div className="mt-3 grid gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <div>
          <span className="font-medium text-slate-900 dark:text-white">{copy.language}:</span>{" "}
          {getLocalizedLanguageLabel(session.sourceLanguage, copy)} -&gt; {getLocalizedLanguageLabel(session.targetLanguage, copy)}
        </div>
        <div>
          <span className="font-medium text-slate-900 dark:text-white">{copy.status}:</span> {statusLabels[session.status]}
        </div>
        <div>
          <span className="font-medium text-slate-900 dark:text-white">{copy.expires}:</span>{" "}
          {new Date(session.expiresAt).toLocaleTimeString()}
        </div>
        <div className="inline-flex items-center gap-1">
          <Users className="h-4 w-4" />
          {session.viewerCount} {session.viewerCount === 1 ? copy.viewer : copy.viewers}
        </div>
      </div>
    </div>
  );
}
