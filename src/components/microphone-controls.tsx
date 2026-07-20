"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Square } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { Button } from "./ui/button";

export type MicrophoneUiStatus = "unknown" | "ready" | "testing" | "active" | "missing" | "blocked";

interface MicrophoneControlsProps {
  selectedDeviceId: string;
  isRecording: boolean;
  recordingLevel: number;
  disabled?: boolean;
  copy: UiCopy;
  onDeviceChange: (deviceId: string) => void;
  onStatusChange: (status: MicrophoneUiStatus) => void;
  onError: (message: string) => void;
}

const TEST_DURATION_MS = 10_000;

function microphoneErrorMessage(error: unknown, copy: UiCopy) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return copy.microphoneStatusBlocked;
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return copy.noMicrophone;
    if (error.name === "NotReadableError" || error.name === "TrackStartError") return copy.microphoneInUse;
  }
  return error instanceof Error ? error.message : copy.noMicrophone;
}

export function MicrophoneControls({
  selectedDeviceId,
  isRecording,
  recordingLevel,
  disabled,
  copy,
  onDeviceChange,
  onStatusChange,
  onError
}: MicrophoneControlsProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [baseStatus, setBaseStatus] = useState<MicrophoneUiStatus>("unknown");
  const [isTesting, setIsTesting] = useState(false);
  const [testLevel, setTestLevel] = useState(0);
  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const testTimerRef = useRef<number | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setBaseStatus("missing");
      return;
    }

    try {
      const availableDevices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput"
      );
      setDevices(availableDevices);
      setBaseStatus(availableDevices.length > 0 ? "ready" : "missing");
    } catch {
      setBaseStatus("unknown");
    }
  }, []);

  const stopTest = useCallback(() => {
    if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    testTimerRef.current = null;
    animationFrameRef.current = null;
    testStreamRef.current?.getTracks().forEach((track) => track.stop());
    testStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setTestLevel(0);
    setIsTesting(false);
  }, []);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (isRecording) stopTest();
  }, [isRecording, stopTest]);

  useEffect(() => stopTest, [stopTest]);

  const effectiveStatus: MicrophoneUiStatus = isRecording ? "active" : isTesting ? "testing" : baseStatus;
  const visibleLevel = isRecording ? recordingLevel : testLevel;

  useEffect(() => {
    onStatusChange(effectiveStatus);
  }, [effectiveStatus, onStatusChange]);

  async function startTest() {
    if (isRecording || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setBaseStatus("missing");
      onError(copy.noMicrophone);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      testStreamRef.current = stream;
      setIsTesting(true);
      setBaseStatus("ready");
      await refreshDevices();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        setTestLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        animationFrameRef.current = window.requestAnimationFrame(updateLevel);
      };
      updateLevel();
      testTimerRef.current = window.setTimeout(stopTest, TEST_DURATION_MS);
    } catch (error) {
      const message = microphoneErrorMessage(error, copy);
      setBaseStatus(
        error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "blocked"
          : "missing"
      );
      onError(message);
      stopTest();
    }
  }

  const statusLabels: Record<MicrophoneUiStatus, string> = {
    unknown: copy.microphoneStatusUnknown,
    ready: copy.microphoneStatusReady,
    testing: copy.microphoneStatusTesting,
    active: copy.microphoneStatusActive,
    missing: copy.microphoneStatusMissing,
    blocked: copy.microphoneStatusBlocked
  };

  return (
    <section className="grid gap-2.5 rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Mic className="h-4 w-4 text-cyan-500" />
          {copy.microphone}
        </h3>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{statusLabels[effectiveStatus]}</span>
      </div>

      <label className="grid gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="microphone-device">
        {copy.microphoneDevice}
        <select
          id="microphone-device"
          value={selectedDeviceId}
          disabled={disabled || isRecording || isTesting || baseStatus === "missing"}
          onChange={(event) => onDeviceChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-cyan-500/20"
        >
          <option value="">{copy.systemDefaultMicrophone}</option>
          {devices.map((device, index) => (
            <option key={device.deviceId || `microphone-${index}`} value={device.deviceId}>
              {device.label || copy.microphoneDeviceFallback.replace("{number}", String(index + 1))}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>{copy.inputLevel}</span>
          <span>{Math.round(visibleLevel * 100)}%</span>
        </div>
        <div
          role="meter"
          aria-label={copy.inputLevel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(visibleLevel * 100)}
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-cyan-500 transition-[width] duration-75"
            style={{ width: `${Math.max(0, Math.min(100, visibleLevel * 100))}%` }}
          />
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={disabled || isRecording || baseStatus === "missing"}
        onClick={isTesting ? stopTest : startTest}
        className="w-full"
      >
        {isTesting ? <Square className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
        {isTesting ? copy.stopMicrophoneTest : copy.testMicrophone}
      </Button>
    </section>
  );
}
