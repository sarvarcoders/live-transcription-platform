"use client";

import { Copy, Users } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary } from "@/shared/types";
import { getLanguageLabel } from "@/shared/languages";
import { Button } from "./ui/button";

export function SessionDetails({ session, copy }: { session: SessionSummary; copy: UiCopy }) {
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}?session=${session.code}`;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.sessionCode}</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{session.code}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(shareUrl || session.id)}
        >
          <Copy className="h-4 w-4" />
          {copy.copyLink}
        </Button>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
        <div>
          <span className="font-medium text-slate-900 dark:text-white">{copy.language}:</span> {getLanguageLabel(session.sourceLanguage)}
        </div>
        <div><span className="font-medium text-slate-900 dark:text-white">{copy.status}:</span> {session.status}</div>
        <div><span className="font-medium text-slate-900 dark:text-white">{copy.expires}:</span> {new Date(session.expiresAt).toLocaleTimeString()}</div>
        <div className="inline-flex items-center gap-1">
          <Users className="h-4 w-4" />
          {session.viewerCount} {session.viewerCount === 1 ? copy.viewer : copy.viewers}
        </div>
      </div>
    </div>
  );
}
