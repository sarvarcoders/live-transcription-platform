"use client";

import { RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { UiCopy } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import { getLanguageLabel } from "@/shared/languages";
import type { SessionSummary } from "@/shared/types";
import { Button } from "./ui/button";

interface SessionDashboardProps {
  activeSessionId?: string;
  onJoinSession: (sessionId: string) => void;
  copy: UiCopy;
}

export function SessionDashboard({ activeSessionId, onJoinSession, copy }: SessionDashboardProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load sessions.");
      setSessions(payload.sessions ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load sessions.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = window.setInterval(loadSessions, 7000);
    return () => window.clearInterval(interval);
  }, [loadSessions]);

  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.sessionDashboard}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{copy.sessionDashboardDescription}</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadSessions} disabled={isLoading} title={copy.refreshSessions}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error ? <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-200">{error}</div> : null}

      <div className="grid gap-3">
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
            {copy.noSessions}
          </div>
        ) : (
          sessions.map((session) => (
            <article key={session.id} className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-bold text-slate-950 dark:text-white">{session.code}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {session.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getLanguageLabel(session.sourceLanguage)} · {copy.updated}{" "}
                    {formatTime(session.updatedAt)} · {copy.expires} {formatTime(session.expiresAt)}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Users className="h-3.5 w-3.5" />
                    {session.viewerCount} {session.viewerCount === 1 ? copy.viewer : copy.viewers}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={activeSessionId === session.id ? "primary" : "secondary"}
                  onClick={() => onJoinSession(session.id)}
                  disabled={activeSessionId === session.id}
                >
                  {activeSessionId === session.id ? copy.joined : copy.join}
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
