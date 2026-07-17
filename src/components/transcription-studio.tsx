"use client";

import { useEffect, useState } from "react";
import { Maximize2, Sparkles } from "lucide-react";
import { uiCopy, type UiLocale, type UiTheme } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import type { SttProvider } from "@/shared/types";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { ConnectionStatus } from "./connection-status";
import { ExportControls } from "./export-controls";
import { type BroadcasterStatus, HostControls } from "./host-controls";
import { PreferenceControls } from "./preference-controls";
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

function parseCreateSessionResponse(payload: CreateSessionResponse, invalidResponseMessage: string) {
  const sessionId = payload.session?.id;
  const broadcasterToken = payload.broadcasterToken;

  if (!sessionId || !broadcasterToken) {
    throw new Error(invalidResponseMessage);
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
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("uz");
  const [sttProvider, setSttProvider] = useState<SttProvider>("auto");
  const [mode, setMode] = useState<Mode>("broadcaster");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

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
    const storedLocale = window.localStorage.getItem("live-ui-locale");
    const storedTheme = window.localStorage.getItem("live-ui-theme");
    if (storedLocale === "en" || storedLocale === "uz") setLocale(storedLocale);
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("live-ui-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("live-ui-locale", locale);
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
      targetLanguage,
      sttProvider,
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
        body: JSON.stringify({ title, sourceLanguage, targetLanguage, sttProvider })
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
        throw new Error(payload.error ?? copy.couldNotCreateSession);
      }

      const { sessionId, broadcasterToken } = parseCreateSessionResponse(payload, copy.invalidCreateSessionResponse);
      live.hostSession(sessionId, broadcasterToken);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : copy.couldNotCreateSession);
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
          error: live.error,
          selectedSttProvider: live.selectedSttProvider
    });
  }, [live.session, live.role, live.connectionState, live.isRecording, live.hasBroadcasterToken, live.error, live.selectedSttProvider]);

  function joinSession() {
    setFormError(null);
    live.clearError();
    live.joinSession(joinSessionId);
  }

  function switchMode(nextMode: Mode) {
    live.leaveSession();
    setFormError(null);
    setMode(nextMode);
  }

  if (focusMode) {
    return (
      <main className="min-h-screen bg-slate-950 p-2 sm:p-4">
        <SubtitlePanel
          segments={live.segments}
          interimSegment={live.interimSegment}
          lastDisplayedTranslation={live.lastDisplayedTranslation}
          pendingTranslation={live.pendingTranslation}
          isTranslationPending={live.isTranslationPending}
          lastFinalTranslation={live.lastFinalTranslation}
          isRecording={live.isRecording}
          connectionState={live.connectionState}
          session={live.session}
          selectedSttProvider={live.selectedSttProvider}
          copy={copy}
          isFocusMode
          onToggleFocus={() => setFocusMode(false)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[118rem] gap-3 px-3 py-3 sm:px-4 lg:px-5">
      <header className="glass-panel flex flex-col justify-between gap-3 rounded-[1.65rem] px-4 py-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <span className="glass-icon grid h-12 w-12 place-items-center rounded-2xl text-sky-700 dark:text-cyan-100">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-cyan-200">{copy.appEyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{copy.appTitle}</h1>
          </div>
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
          <button
            type="button"
            onClick={() => setFocusMode(true)}
            className="glass-pill inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white/60 focus:outline-none focus:ring-4 focus:ring-sky-300/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <Maximize2 className="h-4 w-4" />
            {copy.focusMode}
          </button>
        </div>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[17.5rem_minmax(0,1fr)_18.5rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_19.5rem]">
        <aside className="order-2 grid content-start gap-3 lg:order-1 lg:sticky lg:top-3">
          <div className="glass-panel rounded-[1.45rem] p-3">
            <div className="glass-panel-soft grid grid-cols-2 rounded-2xl p-1">
              <button
                type="button"
                onClick={() => switchMode("broadcaster")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === "broadcaster" ? "bg-white/80 text-sky-700 shadow-sm dark:bg-white/[0.12] dark:text-cyan-100" : "text-slate-600 hover:bg-white/[0.45] dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {copy.broadcasterMode}
              </button>
              <button
                type="button"
                onClick={() => switchMode("viewer")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === "viewer" ? "bg-white/80 text-sky-700 shadow-sm dark:bg-white/[0.12] dark:text-cyan-100" : "text-slate-600 hover:bg-white/[0.45] dark:text-slate-300 dark:hover:bg-white/10"
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
              targetLanguage={targetLanguage}
              sttProvider={sttProvider}
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
              onTargetLanguageChange={setTargetLanguage}
              onSttProviderChange={setSttProvider}
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
            <div className="glass-panel-soft rounded-2xl px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-200">
              {visibleError}
            </div>
          ) : null}

        </aside>

        <div className="order-1 lg:order-2">
          <SubtitlePanel
            segments={live.segments}
            interimSegment={live.interimSegment}
            lastDisplayedTranslation={live.lastDisplayedTranslation}
            pendingTranslation={live.pendingTranslation}
            isTranslationPending={live.isTranslationPending}
            lastFinalTranslation={live.lastFinalTranslation}
            isRecording={live.isRecording}
            connectionState={live.connectionState}
            session={live.session}
            selectedSttProvider={live.selectedSttProvider}
            copy={copy}
            onToggleFocus={() => setFocusMode(true)}
          />
        </div>

        <aside className="order-3 grid content-start gap-3 lg:sticky lg:top-3">
          <ExportControls session={live.session} segments={live.segments} copy={copy} />
          <TranscriptHistory segments={live.segments} copy={copy} />
        </aside>
      </div>
    </main>
  );
}
