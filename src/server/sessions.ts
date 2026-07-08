import { randomBytes, randomUUID } from "node:crypto";
import type { LanguageCode } from "@/shared/languages";
import type { ActiveSttProvider, CreateSessionInput, SessionRole, SessionStatus, SessionSummary, TranscriptSegment } from "@/shared/types";

interface ViewerParticipant {
  token: string;
  socketId?: string;
  joinedAt: Date;
  lastSeenAt: Date;
}

interface LiveSession {
  id: string;
  code: string;
  title: string;
  sourceLanguage: CreateSessionInput["sourceLanguage"];
  targetLanguage: LanguageCode;
  sttProvider: CreateSessionInput["sttProvider"];
  activeSttProvider?: ActiveSttProvider;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  broadcasterToken: string;
  hostSocketId?: string;
  hostDisconnectedAt?: Date;
  viewerTokens: Map<string, ViewerParticipant>;
  transcript: TranscriptSegment[];
}

interface SessionRuntimeState {
  sessions: Map<string, LiveSession>;
  socketIndex: Map<string, { sessionId: string; role: SessionRole; token: string }>;
  cleanupStarted: boolean;
}

const globalSessionState = globalThis as typeof globalThis & {
  __liveTranslationSessionState?: SessionRuntimeState;
};

const runtimeState =
  globalSessionState.__liveTranslationSessionState ??
  (globalSessionState.__liveTranslationSessionState = {
    sessions: new Map<string, LiveSession>(),
    socketIndex: new Map<string, { sessionId: string; role: SessionRole; token: string }>(),
    cleanupStarted: false
  });

const sessions = runtimeState.sessions;
const socketIndex = runtimeState.socketIndex;

const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const HOST_RECONNECT_GRACE_MS = 1000 * 60 * 10;
const VIEWER_IDLE_TTL_MS = 1000 * 60 * 30;
const MAX_TRANSCRIPT_SEGMENTS = 250;

function createSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!sessions.has(code)) return code;
  }

  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function createReconnectToken() {
  return randomBytes(24).toString("base64url");
}

function toSummary(session: LiveSession): SessionSummary {
  return {
    id: session.id,
    code: session.code,
    title: session.title,
    sourceLanguage: session.sourceLanguage,
    targetLanguage: session.targetLanguage,
    sttProvider: session.sttProvider ?? "auto",
    activeSttProvider: session.activeSttProvider,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    viewerCount: [...session.viewerTokens.values()].filter((viewer) => viewer.socketId).length
  };
}

function touch(session: LiveSession) {
  session.updatedAt = new Date();
}

function normalizeSessionId(sessionId: string) {
  return sessionId.trim().toUpperCase();
}

function getSession(sessionId: string) {
  return sessions.get(normalizeSessionId(sessionId)) ?? null;
}

function isExpired(session: LiveSession, now = Date.now()) {
  return session.expiresAt.getTime() <= now || session.status === "expired";
}

function expireSession(session: LiveSession) {
  session.status = "expired";
  session.hostSocketId = undefined;
  for (const viewer of session.viewerTokens.values()) {
    viewer.socketId = undefined;
  }
  touch(session);
}

export const sessionStore = {
  create(input: CreateSessionInput) {
    console.info("[session] create requested", {
      title: input.title,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      sttProvider: input.sttProvider ?? "auto"
    });
    const now = new Date();
    const code = createSessionCode();
    const session: LiveSession = {
      id: code,
      code,
      title: input.title?.trim() || "Live Transcription Session",
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage ?? input.sourceLanguage,
      sttProvider: input.sttProvider ?? "auto",
      activeSttProvider: undefined,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      broadcasterToken: createReconnectToken(),
      viewerTokens: new Map(),
      transcript: []
    };

    sessions.set(code, session);
    console.info("[session] created successfully", {
      sessionId: session.id,
      code: session.code,
      broadcasterTokenGenerated: Boolean(session.broadcasterToken),
      expiresAt: session.expiresAt.toISOString()
    });
    return { session: toSummary(session), broadcasterToken: session.broadcasterToken };
  },

  get(id: string) {
    const session = getSession(id);
    if (!session) return null;
    if (isExpired(session)) {
      expireSession(session);
    }
    return toSummary(session);
  },

  getLive(id: string) {
    const session = getSession(id);
    if (!session || isExpired(session)) return null;
    return session;
  },

  list() {
    this.cleanupExpired();
    return [...sessions.values()].map(toSummary);
  },

  setHost(sessionId: string, socketId: string, reconnectToken?: string) {
    const session = getSession(sessionId);
    if (!session || isExpired(session)) {
      console.warn("[session] host denied", { sessionId, socketId, reason: "not_found_or_expired" });
      return null;
    }
    if (reconnectToken && reconnectToken !== session.broadcasterToken) {
      console.warn("[session] host denied", { sessionId, socketId, reason: "invalid_broadcaster_token" });
      return null;
    }

    if (session.hostSocketId && session.hostSocketId !== socketId) {
      socketIndex.delete(session.hostSocketId);
    }

    session.hostSocketId = socketId;
    session.hostDisconnectedAt = undefined;
    session.status = "live";
    socketIndex.set(socketId, { sessionId: session.id, role: "host", token: session.broadcasterToken });
    touch(session);
    console.info("[session] host attached", {
      sessionId: session.id,
      socketId,
      reconnectTokenProvided: Boolean(reconnectToken)
    });
    return { session: toSummary(session), reconnectToken: session.broadcasterToken };
  },

  addViewer(sessionId: string, socketId: string, reconnectToken?: string) {
    const session = getSession(sessionId);
    if (!session || isExpired(session)) return null;

    const now = new Date();
    const token = reconnectToken && session.viewerTokens.has(reconnectToken) ? reconnectToken : createReconnectToken();
    const existing = session.viewerTokens.get(token);

    if (existing?.socketId && existing.socketId !== socketId) {
      socketIndex.delete(existing.socketId);
    }

    session.viewerTokens.set(token, {
      token,
      socketId,
      joinedAt: existing?.joinedAt ?? now,
      lastSeenAt: now
    });
    socketIndex.set(socketId, { sessionId: session.id, role: "viewer", token });
    touch(session);
    return { session: toSummary(session), reconnectToken: token };
  },

  detachSocket(socketId: string) {
    const membership = socketIndex.get(socketId);
    if (!membership) return [];
    socketIndex.delete(socketId);

    const session = sessions.get(membership.sessionId);
    if (!session) return [];

    if (membership.role === "host" && session.hostSocketId === socketId) {
      session.hostSocketId = undefined;
      session.hostDisconnectedAt = new Date();
      if (session.status === "live") {
        session.status = "waiting";
      }
    }

    if (membership.role === "viewer") {
      const viewer = session.viewerTokens.get(membership.token);
      if (viewer?.socketId === socketId) {
        viewer.socketId = undefined;
        viewer.lastSeenAt = new Date();
      }
    }

    touch(session);
    return [toSummary(session)];
  },

  leaveSocket(socketId: string) {
    const membership = socketIndex.get(socketId);
    if (!membership) return [];
    socketIndex.delete(socketId);

    const session = sessions.get(membership.sessionId);
    if (!session) return [];

    if (membership.role === "host" && session.hostSocketId === socketId) {
      session.hostSocketId = undefined;
      session.hostDisconnectedAt = undefined;
      session.status = "ended";
    }

    if (membership.role === "viewer") {
      session.viewerTokens.delete(membership.token);
    }

    touch(session);
    return [toSummary(session)];
  },

  addTranscript(sessionId: string, segment: TranscriptSegment) {
    const session = getSession(sessionId);
    if (!session || isExpired(session)) return null;
    const existingIndex = session.transcript.findIndex((item) => item.id === segment.id);
    if (existingIndex >= 0) {
      session.transcript = session.transcript.map((item) => (item.id === segment.id ? segment : item));
    } else {
      session.transcript = [...session.transcript.slice(-(MAX_TRANSCRIPT_SEGMENTS - 1)), segment];
    }
    touch(session);
    return segment;
  },

  getTranscript(sessionId: string) {
    return getSession(sessionId)?.transcript ?? [];
  },

  markError(sessionId: string) {
    const session = getSession(sessionId);
    if (!session || isExpired(session)) return null;
    session.status = "error";
    touch(session);
    return toSummary(session);
  },

  setActiveSttProvider(sessionId: string, provider: ActiveSttProvider) {
    const session = getSession(sessionId);
    if (!session || isExpired(session)) return null;
    session.activeSttProvider = provider;
    touch(session);
    return toSummary(session);
  },

  cleanupExpired() {
    const now = Date.now();
    for (const session of sessions.values()) {
      for (const [token, viewer] of session.viewerTokens.entries()) {
        if (!viewer.socketId && now - viewer.lastSeenAt.getTime() > VIEWER_IDLE_TTL_MS) {
          session.viewerTokens.delete(token);
        }
      }

      const hostGraceExpired =
        !session.hostSocketId &&
        session.hostDisconnectedAt &&
        now - session.hostDisconnectedAt.getTime() > HOST_RECONNECT_GRACE_MS;

      if (hostGraceExpired && session.status === "waiting") {
        session.status = "ended";
      }

      if (isExpired(session, now)) {
        expireSession(session);
      }
    }
  }
};

if (!runtimeState.cleanupStarted) {
  runtimeState.cleanupStarted = true;
  setInterval(() => sessionStore.cleanupExpired(), 1000 * 60).unref();
}
