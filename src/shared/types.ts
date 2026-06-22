import type { LanguageCode } from "./languages";

export type SessionStatus = "waiting" | "live" | "ended" | "error" | "expired";
export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface SessionSummary {
  id: string;
  code: string;
  title: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  viewerCount: number;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  text: string;
  translatedText?: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  isFinal: boolean;
  translationStatus?: "pending" | "complete" | "error";
  confidence?: number;
  startedAt: string;
  completedAt?: string;
  metrics?: LatencyMetrics;
}

export interface LatencyMetrics {
  capturedAt?: number;
  audioReceivedAt?: number;
  deepgramReceivedAt?: number;
  translationStartedAt?: number;
  firstTokenAt?: number;
  translationCompletedAt?: number;
  emittedAt?: number;
  clientReceivedAt?: number;
  speechCaptureLatencyMs?: number;
  deepgramLatencyMs?: number;
  openaiFirstTokenLatencyMs?: number;
  openaiTotalLatencyMs?: number;
  websocketDeliveryLatencyMs?: number;
  totalLatencyMs?: number;
}

export interface CreateSessionInput {
  title?: string;
  sourceLanguage: LanguageCode;
  targetLanguage?: LanguageCode;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
}

export type SessionRole = "host" | "viewer";

export interface ClientToServerEvents {
  "session:host": (payload: { sessionId: string; reconnectToken?: string }) => void;
  "session:join": (payload: { sessionId: string; reconnectToken?: string }) => void;
  "session:leave": (payload: { sessionId: string }) => void;
  "audio:start": (payload: { sessionId: string; mimeType: string }) => void;
  "audio:chunk": (payload: { sessionId: string; audio: ArrayBuffer; capturedAt: number; sentAt: number }) => void;
  "audio:stop": (payload: { sessionId: string }) => void;
}

export interface ServerToClientEvents {
  "session:ready": (payload: { session: SessionSummary; role: SessionRole; reconnectToken: string }) => void;
  "session:updated": (payload: { session: SessionSummary }) => void;
  "transcript:update": (payload: { segment: TranscriptSegment }) => void;
  "connection:state": (payload: { state: ConnectionState; message?: string }) => void;
  "server:error": (payload: SocketErrorPayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  sessionId?: string;
  role?: "host" | "viewer";
}
