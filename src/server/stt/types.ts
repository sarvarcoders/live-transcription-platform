import type { ActiveSttProvider, SttProvider } from "@/shared/types";
import type { LanguageCode } from "@/shared/languages";

export interface SttTranscript {
  text: string;
  isFinal: boolean;
  speechFinal?: boolean;
  confidence?: number;
  provider: ActiveSttProvider;
}

export interface SttStreamOptions {
  sessionId: string;
  sourceLanguage: LanguageCode;
  mimeType: string;
  onTranscript: (transcript: SttTranscript) => void;
  onError: (error: Error) => void;
  onRecoverableError?: (error: Error) => void;
  onActivity?: (activity: "stt_request_started" | "transcript_received") => void;
  onClose: () => void;
}

export interface SttAudioChunkMetadata {
  capturedAt?: number;
  sentAt?: number;
  durationEstimateMs?: number;
  isStandaloneFile?: boolean;
}

export interface SttStream {
  readonly provider: ActiveSttProvider;
  start: () => void;
  send: (audio: Buffer, metadata?: SttAudioChunkMetadata) => void;
  stop: () => void;
}

export interface ProviderSelection {
  requestedProvider: SttProvider;
  provider: ActiveSttProvider;
  fallbackReason?: string;
}

export class SttProviderError extends Error {
  constructor(
    readonly provider: ActiveSttProvider,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "SttProviderError";
  }
}
