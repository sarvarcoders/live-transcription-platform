"use client";

import { LogIn } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary } from "@/shared/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SessionDetails } from "./session-details";

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
    <section className="grid gap-4 rounded-2xl border border-white/70 bg-slate-50/[0.85] p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.viewerControls}</h2>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{copy.viewerDescription}</p>
      </div>

      {session ? (
        <>
          <SessionDetails session={session} copy={copy} />
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
