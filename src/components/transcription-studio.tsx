"use client";

import { useEffect, useState } from "react";
import { Maximize2, PanelRightOpen } from "lucide-react";
import { uiCopy, type UiLocale, type UiTheme } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LanguageCode } from "@/shared/languages";
import type { ActiveSttProvider, SttProvider } from "@/shared/types";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { type BroadcasterStatus, HostControls } from "./host-controls";
import { PreferenceControls } from "./preference-controls";
import { SubtitlePanel } from "./subtitle-panel";
import { ViewerControls } from "./viewer-controls";
import { BrandLogo } from "./brand-logo";
import { ContextSidebar } from "./context-sidebar";
import { GlobalLiveStatus, type GlobalLiveStatusKind } from "./global-live-status";
import { LiveErrorToast } from "./live-error-toast";
import type { MicrophoneUiStatus } from "./microphone-controls";

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
  if (input.isRecording) return "recording";
  if (input.isCreating) return "creating";
  if (input.wasRecording && input.hasSession) return "stopped";
  if (input.hasSession) return "ready";
  if (input.hasError) return "error";
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
  const [contextOpen, setContextOpen] = useState(false);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneUiStatus>("unknown");

  const live = useLiveTranscription();
  const copy = uiCopy[locale];
  const visibleError = formError || live.error;
  const visibleWarning = live.warning;
  const broadcasterStatus = getBroadcasterStatus({
    isCreating,
    isRecording: live.isRecording,
    hasSession: Boolean(live.session),
    hasError: Boolean(visibleError),
    wasRecording: hasRecorded
  });
  const resolvedProvider: ActiveSttProvider | null =
    live.selectedSttProvider ??
    live.session?.activeSttProvider ??
    (sttProvider === "auto" ? (sourceLanguage === "uz" ? "openai" : "deepgram") : sttProvider);
  const latestLatencyMs = live.latencySamples.at(-1)?.totalLatencyMs;
  const hasContext = Boolean(live.session || live.segments.some((segment) => segment.isFinal));
  const globalStatus: GlobalLiveStatusKind =
    live.connectionState === "reconnecting" || (live.connectionState === "connecting" && Boolean(live.session))
      ? "reconnecting"
      : isCreating
        ? "creating"
        : live.isTranslationPending
          ? "translating"
          : live.isRecording
            ? "listening"
            : live.session
              ? hasRecorded
                ? "paused"
                : "ready"
              : visibleError
                ? "error"
                : "setup";

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

  useEffect(() => {
    if (live.session?.id) setContextOpen(true);
  }, [live.session?.id]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && focusMode) setFocusMode(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [focusMode]);

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

  function changeSourceLanguage(nextLanguage: LanguageCode) {
    if (nextLanguage === targetLanguage) setTargetLanguage(sourceLanguage);
    setSourceLanguage(nextLanguage);
    if (nextLanguage === "uz" && sttProvider === "deepgram") setSttProvider("auto");
  }

  function changeTargetLanguage(nextLanguage: LanguageCode) {
    if (nextLanguage !== sourceLanguage) setTargetLanguage(nextLanguage);
  }

  function swapLanguages() {
    const nextSourceLanguage = targetLanguage;
    setSourceLanguage(nextSourceLanguage);
    setTargetLanguage(sourceLanguage);
    if (nextSourceLanguage === "uz" && sttProvider === "deepgram") setSttProvider("auto");
  }

  function switchMode(nextMode: Mode) {
    if (nextMode === mode) return;
    live.leaveSession();
    setFormError(null);
    setMode(nextMode);
  }

  return (
    <main
      className={cn(
        "mx-auto grid min-h-screen w-full max-w-[112rem] gap-3 px-3 py-3 sm:px-4 lg:px-5",
        focusMode && "max-w-none bg-slate-950 p-2 sm:p-4"
      )}
    >
      <header
        className={cn(
          "relative z-30 flex min-h-20 flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-2.5 shadow-soft dark:border-slate-800 dark:bg-slate-900/85 md:flex-row md:items-center",
          focusMode && "hidden"
        )}
      >
        <BrandLogo />
        <div className="flex flex-wrap items-center gap-2">
          <GlobalLiveStatus
            status={globalStatus}
            connectionState={live.connectionState}
            microphoneStatus={microphoneStatus}
            provider={resolvedProvider}
            latencyMs={latestLatencyMs}
            copy={copy}
          />
          <PreferenceControls
            locale={locale}
            theme={theme}
            copy={copy}
            onLocaleChange={setLocale}
            onThemeChange={setTheme}
          />
          {hasContext ? (
            <button
              type="button"
              onClick={() => setContextOpen((current) => !current)}
              aria-expanded={contextOpen}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
              title={copy.sessionPanel}
            >
              <PanelRightOpen className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.sessionPanel}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setFocusMode(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
          >
            <Maximize2 className="h-4 w-4" />
            {copy.focusMode}
          </button>
        </div>
      </header>

      <div
        className={cn(
          "grid items-start gap-3",
          focusMode
            ? "grid-cols-1"
            : contextOpen && hasContext
              ? "lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)_19rem]"
              : "lg:grid-cols-[18.5rem_minmax(0,1fr)]"
        )}
      >
        <aside className={cn("order-1 grid min-w-0 content-start gap-3 lg:sticky lg:top-3", focusMode && "hidden")}>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-soft dark:border-slate-800 dark:bg-slate-900/80">
            <div className="grid grid-cols-2 rounded-lg border border-slate-200/80 bg-slate-200/[0.45] p-1 dark:border-slate-700 dark:bg-slate-950/70">
              <button
                type="button"
                onClick={() => switchMode("broadcaster")}
                title={copy.hostModeTooltip}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  mode === "broadcaster" ? "bg-white/90 text-brand-700 shadow-sm dark:bg-slate-800 dark:text-cyan-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {copy.broadcasterMode}
              </button>
              <button
                type="button"
                onClick={() => switchMode("viewer")}
                title={copy.viewerModeTooltip}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  mode === "viewer" ? "bg-white/90 text-brand-700 shadow-sm dark:bg-slate-800 dark:text-cyan-200" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
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
              selectedMicrophoneId={selectedMicrophoneId}
              microphoneStatus={microphoneStatus}
              audioLevel={live.audioLevel}
              copy={copy}
              onTitleChange={setTitle}
              onSourceLanguageChange={changeSourceLanguage}
              onTargetLanguageChange={changeTargetLanguage}
              onSwapLanguages={swapLanguages}
              onSttProviderChange={setSttProvider}
              onMicrophoneDeviceChange={setSelectedMicrophoneId}
              onMicrophoneStatusChange={setMicrophoneStatus}
              onMicrophoneError={setFormError}
              onCreateSession={createSession}
              onStartRecording={() => live.startRecording({ deviceId: selectedMicrophoneId || undefined })}
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
        </aside>

        <div className={cn("order-2 min-w-0 lg:order-2", focusMode && "order-1")}>
          <SubtitlePanel
            segments={live.segments}
            interimSegment={live.interimSegment}
            lastDisplayedTranslation={live.lastDisplayedTranslation}
            pendingTranslation={live.pendingTranslation}
            isTranslationPending={live.isTranslationPending}
            lastFinalTranslation={live.lastFinalTranslation}
            isRecording={live.isRecording}
            audioLevel={live.audioLevel}
            connectionState={live.connectionState}
            session={live.session}
            copy={copy}
            isFocusMode={focusMode}
            onToggleFocus={() => setFocusMode(false)}
          />
        </div>

        <ContextSidebar
          open={!focusMode && contextOpen}
          session={live.session}
          segments={live.segments}
          copy={copy}
          onClose={() => setContextOpen(false)}
        />
      </div>

      {visibleError ? (
        <LiveErrorToast
          message={visibleError}
          copy={copy}
          onDismiss={() => {
            setFormError(null);
            live.clearError();
          }}
        />
      ) : visibleWarning ? (
        <LiveErrorToast message={visibleWarning} copy={copy} onDismiss={live.clearWarning} />
      ) : null}
    </main>
  );
}
