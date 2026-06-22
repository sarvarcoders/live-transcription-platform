"use client";

import { useEffect, useState } from "react";
import { Activity, History } from "lucide-react";
import { uiCopy, type UiLocale, type UiTheme } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { ConnectionStatus } from "./connection-status";
import { ExportControls } from "./export-controls";
import { type BroadcasterStatus, HostControls } from "./host-controls";
import { LatencyDashboard } from "./latency-dashboard";
import { PreferenceControls } from "./preference-controls";
import { SessionDashboard } from "./session-dashboard";
import { SubtitlePanel } from "./subtitle-panel";
import { TranscriptHistory } from "./transcript-history";
import { ViewerControls } from "./viewer-controls";

type Mode = "broadcaster" | "viewer";

interface CreateSessionResponse {
  session?: {
    id?: string;
  };
  broadcasterToken?: string;
  error?: string;
}

function parseCreateSessionResponse(payload: CreateSessionResponse) {
  const sessionId = payload.session?.id;
  const broadcasterToken = payload.broadcasterToken;

  if (!sessionId || !broadcasterToken) {
    throw new Error("Session was created without a valid session id or broadcaster token.");
  }

  return { sessionId, broadcasterToken };
}

function getBroadcasterStatus(input: {
  isCreating: boolean;
  isRecording: boolean;
  hasSession: boolean;
  hasError: boolean;
  wasRecording: boolean;
}): BroadcasterStatus {
  if (input.hasError) return "error";
  if (input.isRecording) return "recording";
  if (input.isCreating) return "creating";
  if (input.wasRecording && input.hasSession) return "stopped";
  if (input.hasSession) return "ready";
  return "idle";
}

export function TranscriptionStudio() {
  const [title, setTitle] = useState("Live Transcription Session");
  const [locale, setLocale] = useState<UiLocale>("en");
  const [theme, setTheme] = useState<UiTheme>("light");
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [mode, setMode] = useState<Mode>("broadcaster");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasRecorded, setHasRecorded] = useState(false);

  const live = useLiveTranscription();
  const copy = uiCopy[locale];
  const visibleError = formError || live.error;
  const broadcasterStatus = getBroadcasterStatus({
    isCreating,
    isRecording: live.isRecording,
    hasSession: Boolean(live.session),
    hasError: Boolean(visibleError),
    wasRecording: hasRecorded
  });

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("tts-ui-locale");
    const storedTheme = window.localStorage.getItem("tts-ui-theme");
    if (storedLocale === "en" || storedLocale === "uz") setLocale(storedLocale);
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("tts-ui-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("tts-ui-locale", locale);
  }, [locale]);

  useEffect(() => {
    if (live.isRecording) setHasRecorded(true);
    if (!live.session) setHasRecorded(false);
  }, [live.isRecording, live.session]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");
    if (sessionId) {
      setMode("viewer");
      setJoinSessionId(sessionId);
    }
  }, []);

  useEffect(() => {
    if (live.role === "viewer") {
      setMode("viewer");
      if (live.session) setJoinSessionId(live.session.id);
    }
    if (live.role === "broadcaster") {
      setMode("broadcaster");
    }
  }, [live.role, live.session]);

  async function createSession() {
    console.info("[frontend] Create session clicked", {
      title,
      sourceLanguage,
      currentSessionId: live.session?.id,
      connectionState: live.connectionState,
      hasBroadcasterToken: live.hasBroadcasterToken
    });
    setIsCreating(true);
    setFormError(null);
    live.clearError();

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceLanguage })
      });

      const payload = (await response.json()) as CreateSessionResponse;
      console.info("[frontend] create session response", {
        ok: response.ok,
        status: response.status,
        sessionId: payload.session?.id,
        broadcasterTokenPresent: Boolean(payload.broadcasterToken),
        error: payload.error
      });
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create session.");
      }

      const { sessionId, broadcasterToken } = parseCreateSessionResponse(payload);
      live.hostSession(sessionId, broadcasterToken);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create session.");
    } finally {
      setIsCreating(false);
    }
  }

  useEffect(() => {
    console.info("[frontend] current live state", {
      sessionId: live.session?.id,
      role: live.role,
      connectionState: live.connectionState,
      isRecording: live.isRecording,
      hasBroadcasterToken: live.hasBroadcasterToken,
      error: live.error
    });
  }, [live.session, live.role, live.connectionState, live.isRecording, live.hasBroadcasterToken, live.error]);

  function joinSession() {
    setFormError(null);
    live.clearError();
    live.joinSession(joinSessionId);
  }

  function joinDashboardSession(sessionId: string) {
    setMode("viewer");
    setJoinSessionId(sessionId);
    setFormError(null);
    live.clearError();
    live.joinSession(sessionId);
  }

  function switchMode(nextMode: Mode) {
    live.leaveSession();
    setFormError(null);
    setMode(nextMode);
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[96rem] gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-white/70 bg-white/75 p-5 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-cyan-300">{copy.appEyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{copy.appTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.appDescription}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PreferenceControls
            locale={locale}
            theme={theme}
            copy={copy}
            onLocaleChange={setLocale}
            onThemeChange={setTheme}
          />
          <ConnectionStatus state={live.connectionState} message={live.connectionMessage} copy={copy} />
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[18.5rem_minmax(0,1fr)_20rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <aside className="order-2 grid content-start gap-4 lg:order-1 lg:sticky lg:top-5">
          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.broadcasterControls}</h2>
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.broadcasterDescription}</p>
            </div>
            <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-700 dark:bg-slate-950/70">
            <button
              type="button"
              onClick={() => switchMode("broadcaster")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                mode === "broadcaster" ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-cyan-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {copy.broadcasterMode}
            </button>
            <button
              type="button"
              onClick={() => switchMode("viewer")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                mode === "viewer" ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-cyan-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {copy.viewerMode}
            </button>
            </div>
          </div>

          {mode === "broadcaster" ? (
            <HostControls
              title={title}
              sourceLanguage={sourceLanguage}
              session={live.session}
              isCreating={isCreating}
              isRecording={live.isRecording}
              hasBroadcasterToken={live.hasBroadcasterToken}
              connectionState={live.connectionState}
              status={broadcasterStatus}
              error={visibleError}
              copy={copy}
              onTitleChange={setTitle}
              onSourceLanguageChange={setSourceLanguage}
              onCreateSession={createSession}
              onStartRecording={live.startRecording}
              onStopRecording={live.stopRecording}
              onLeaveSession={live.leaveSession}
            />
          ) : (
            <ViewerControls
              sessionId={joinSessionId}
              session={live.session}
              onSessionIdChange={setJoinSessionId}
              onJoinSession={joinSession}
              onLeaveSession={live.leaveSession}
              copy={copy}
            />
          )}

          {visibleError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-200">
              {visibleError}
            </div>
          ) : null}

          <LatencyDashboard samples={live.latencySamples} copy={copy} />

          <SessionDashboard activeSessionId={live.session?.id} onJoinSession={joinDashboardSession} copy={copy} />
        </aside>

        <div className="order-1 lg:order-2">
          <SubtitlePanel
            segments={live.segments}
            interimSegment={live.interimSegment}
            isRecording={live.isRecording}
            connectionState={live.connectionState}
            session={live.session}
            copy={copy}
          />
        </div>

        <aside className="order-3 grid content-start gap-4 lg:sticky lg:top-5">
          <section className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.history}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{copy.historyDescription}</p>
              </div>
              <History className="h-5 w-5 text-brand-600" />
            </div>
          </section>
          <ExportControls session={live.session} segments={live.segments} copy={copy} />
          <TranscriptHistory segments={live.segments} copy={copy} />
          <section className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Activity className="h-4 w-4 text-brand-600" />
              {copy.sessionStatus}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>{copy.mode}</span>
                <span className="font-semibold capitalize text-slate-900 dark:text-white">
                  {mode === "broadcaster" ? copy.broadcasterMode : copy.viewerMode}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.recording}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{live.isRecording ? copy.live : copy.off}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.segments}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{live.segments.length}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
