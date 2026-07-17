"use client";

import { RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import { formatTime } from "@/lib/utils";
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
  const statusLabels: Record<SessionSummary["status"], string> = {
    waiting: copy.statusWaiting,
    live: copy.statusLive,
    ended: copy.statusEnded,
    error: copy.statusError,
    expired: copy.statusExpired
  };

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
    <section className="glass-panel rounded-[1.45rem] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.sessionDashboard}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{copy.sessionDashboardDescription}</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadSessions} disabled={isLoading} title={copy.refreshSessions}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error ? <div className="glass-panel-soft mb-3 rounded-2xl px-3 py-2 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}

      <div className="grid gap-3">
        {sessions.length === 0 ? (
          <div className="glass-panel-soft rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {copy.noSessions}
          </div>
        ) : (
          sessions.map((session) => (
            <article key={session.id} className="glass-panel-soft rounded-2xl p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-bold text-slate-950 dark:text-white">{session.code}</span>
                    <span className="glass-pill rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {statusLabels[session.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getLocalizedLanguageLabel(session.sourceLanguage, copy)} · {copy.updated}{" "}
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
