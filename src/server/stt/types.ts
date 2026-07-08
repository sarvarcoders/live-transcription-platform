import type { ActiveSttProvider, SttProvider } from "@/shared/types";
import type { LanguageCode } from "@/shared/languages";

export interface SttTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
  provider: ActiveSttProvider;
}

export interface SttStreamOptions {
  sessionId: string;
  sourceLanguage: LanguageCode;
  mimeType: string;
  onTranscript: (transcript: SttTranscript) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export interface SttStream {
  readonly provider: ActiveSttProvider;
  start: () => void;
  send: (audio: Buffer) => void;
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
