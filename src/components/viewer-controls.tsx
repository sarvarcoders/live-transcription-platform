"use client";

import { LogIn } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary } from "@/shared/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface ViewerControlsProps {
  sessionId: string;
  session: SessionSummary | null;
  onSessionIdChange: (sessionId: string) => void;
  onJoinSession: () => void;
  onLeaveSession: () => void;
  copy: UiCopy;
}

export function ViewerControls({
  sessionId,
  session,
  onSessionIdChange,
  onJoinSession,
  onLeaveSession,
  copy
}: ViewerControlsProps) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{copy.viewerControls}</h2>
        {!session ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.viewerDescription}</p> : null}
      </div>

      {session ? (
        <>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-950">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{copy.sessionCode}</p>
            <p className="mt-0.5 font-mono text-lg font-bold tracking-[0.12em] text-slate-950 dark:text-white">{session.code}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onLeaveSession}>
            {copy.leaveSession}
          </Button>
        </>
      ) : (
        <div className="grid gap-2">
          <Input
            value={sessionId}
            onChange={(event) => onSessionIdChange(event.target.value.trim())}
            placeholder={copy.enterSessionCode}
            aria-label={copy.sessionCode}
          />
          <Button type="button" onClick={onJoinSession} disabled={!sessionId} className="w-full">
            <LogIn className="h-4 w-4" />
            {copy.join}
          </Button>
        </div>
      )}
    </section>
  );
}
