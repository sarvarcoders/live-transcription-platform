"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { uiCopy, type UiLocale, type UiTheme } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { ConnectionStatus } from "./connection-status";
import { ExportControls } from "./export-controls";
import { type BroadcasterStatus, HostControls } from "./host-controls";
import { PreferenceControls } from "./preference-controls";
import { SubtitlePanel } from "./subtitle-panel";
import { TranscriptHistory } from "./transcript-history";
import { VoiceControls } from "./voice-controls";
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
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("uz");
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
      targetLanguage,
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
        body: JSON.stringify({ title, sourceLanguage, targetLanguage })
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
          copy={copy}
          isFocusMode
          onToggleFocus={() => setFocusMode(false)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[112rem] gap-3 px-3 py-3 sm:px-4 lg:px-5">
      <header className="flex flex-col justify-between gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-cyan-300">{copy.appEyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{copy.appTitle}</h1>
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
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
          >
            <Maximize2 className="h-4 w-4" />
            {copy.focusMode}
          </button>
        </div>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[17.5rem_minmax(0,1fr)_18.5rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_19.5rem]">
        <aside className="order-2 grid content-start gap-3 lg:order-1 lg:sticky lg:top-3">
          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
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
              targetLanguage={targetLanguage}
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
            copy={copy}
            onToggleFocus={() => setFocusMode(true)}
          />
        </div>

        <aside className="order-3 grid content-start gap-3 lg:sticky lg:top-3">
          <VoiceControls
            isAvailable={live.isVoiceAvailable}
            isConfigured={live.isVoiceConfigured}
            isEnabled={live.isVoiceEnabled}
            isPlaying={live.isVoicePlaying}
            queueLength={live.voiceQueueLength}
            error={live.voiceError}
            copy={copy}
            onToggle={live.setVoiceEnabled}
            onStop={live.stopVoice}
          />
          <ExportControls session={live.session} segments={live.segments} copy={copy} />
          <TranscriptHistory segments={live.segments} copy={copy} />
        </aside>
      </div>
    </main>
  );
}
