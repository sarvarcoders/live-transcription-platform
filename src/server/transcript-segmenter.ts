import type { ActiveSttProvider, LatencyMetrics } from "@/shared/types";

export type SegmentCommitReason = "punctuation" | "silence" | "max_duration" | "max_chars" | "stop_flush";

export interface TranscriptSegmenterConfig {
  commitOnPunctuation: boolean;
  silenceMs: number;
  minChars: number;
  maxChars: number;
  maxDurationMs: number;
  finalDebounceMs: number;
}

export interface TranscriptFragment {
  text: string;
  provider: ActiveSttProvider;
  confidence?: number;
  receivedAt: number;
  startedAt?: string;
  speechFinal?: boolean;
  metrics?: LatencyMetrics;
}

export interface CommittedTranscriptSegment {
  sequenceId: number;
  text: string;
  provider: ActiveSttProvider;
  confidence?: number;
  reason: SegmentCommitReason;
  startedAt: string;
  completedAt: string;
  metrics?: LatencyMetrics;
}

export interface TranscriptAppendResult {
  disposition: "appended" | "deduplicated" | "ignored";
  currentTranscriptBuffer: string;
  currentBufferLength: number;
}

type BufferMetadata = {
  provider: ActiveSttProvider;
  confidence?: number;
  metrics?: LatencyMetrics;
};

const TRAILING_SENTENCE_PUNCTUATION = /[.!?…][\])}"'»]*$/u;
const TOKEN_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const RECENT_FRAGMENT_LIMIT = 20;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function comparisonText(text: string) {
  return normalizeText(text)
    .toLocaleLowerCase()
    .replace(/[.!?…]+$/u, "")
    .trim();
}

function comparisonTokens(text: string) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.toLocaleLowerCase().replace(TOKEN_EDGE_PUNCTUATION, ""))
    .filter(Boolean);
}

function mergeTranscriptText(current: string, incoming: string) {
  const normalizedCurrent = normalizeText(current);
  const normalizedIncoming = normalizeText(incoming);
  if (!normalizedCurrent) return { text: normalizedIncoming, changed: Boolean(normalizedIncoming) };
  if (!normalizedIncoming) return { text: normalizedCurrent, changed: false };

  const currentComparison = comparisonText(normalizedCurrent);
  const incomingComparison = comparisonText(normalizedIncoming);
  if (!incomingComparison || incomingComparison === currentComparison) {
    return { text: normalizedCurrent, changed: false };
  }

  if (currentComparison.endsWith(` ${incomingComparison}`) || currentComparison.startsWith(`${incomingComparison} `)) {
    return { text: normalizedCurrent, changed: false };
  }

  if (incomingComparison.startsWith(`${currentComparison} `)) {
    return { text: normalizedIncoming, changed: normalizedIncoming !== normalizedCurrent };
  }

  const currentTokens = comparisonTokens(normalizedCurrent);
  const incomingTokens = comparisonTokens(normalizedIncoming);
  const maxOverlap = Math.min(currentTokens.length, incomingTokens.length);
  let overlap = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    const currentSuffix = currentTokens.slice(-size).join(" ");
    const incomingPrefix = incomingTokens.slice(0, size).join(" ");
    if (currentSuffix === incomingPrefix) {
      overlap = size;
      break;
    }
  }

  if (overlap >= incomingTokens.length) return { text: normalizedCurrent, changed: false };

  const originalIncomingTokens = normalizedIncoming.split(" ");
  const addition = originalIncomingTokens.slice(overlap).join(" ");
  return {
    text: normalizeText(`${normalizedCurrent} ${addition}`),
    changed: Boolean(addition)
  };
}

function findSafeCut(text: string, maxChars: number) {
  const withinLimit = text.slice(0, maxChars + 1);
  const punctuationMatches = [...withinLimit.matchAll(/[.!?…;:]/gu)];
  const punctuationCut = punctuationMatches.at(-1)?.index;
  if (punctuationCut !== undefined && punctuationCut >= Math.floor(maxChars * 0.55)) return punctuationCut + 1;

  const whitespaceCut = withinLimit.lastIndexOf(" ", maxChars);
  if (whitespaceCut > 0) return whitespaceCut;
  return Math.min(maxChars, text.length);
}

export class TranscriptSegmenter {
  currentTranscriptBuffer = "";
  currentSegmentStartedAt: number | null = null;
  lastTranscriptActivityAt: number | null = null;
  nextSegmentSequenceId = 1;

  private metadata: BufferMetadata | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private boundaryTimer: NodeJS.Timeout | null = null;
  private recentFragments = new Map<string, number>();

  constructor(
    private readonly config: TranscriptSegmenterConfig,
    private readonly onCommit: (segment: CommittedTranscriptSegment) => void
  ) {}

  append(fragment: TranscriptFragment): TranscriptAppendResult {
    const text = normalizeText(fragment.text);
    if (!text) return this.result("ignored");

    const fingerprint = comparisonText(text);
    const recentAt = this.recentFragments.get(fingerprint);
    const duplicateWindowMs = Math.max(this.config.silenceMs * 2, 2500);
    if (recentAt && fragment.receivedAt - recentAt < duplicateWindowMs) {
      return this.result("deduplicated");
    }

    const merged = mergeTranscriptText(this.currentTranscriptBuffer, text);
    if (!merged.changed) {
      this.rememberFragment(fingerprint, fragment.receivedAt);
      this.lastTranscriptActivityAt = fragment.receivedAt;
      this.scheduleSilenceCommit();
      return this.result("deduplicated");
    }

    if (this.currentSegmentStartedAt === null) {
      this.currentSegmentStartedAt = fragment.receivedAt;
      this.metadata = {
        provider: fragment.provider,
        confidence: fragment.confidence,
        metrics: fragment.metrics
      };
      this.scheduleMaxDurationCommit();
    } else if (typeof fragment.confidence === "number") {
      this.metadata = {
        ...(this.metadata ?? { provider: fragment.provider }),
        confidence:
          typeof this.metadata?.confidence === "number"
            ? (this.metadata.confidence + fragment.confidence) / 2
            : fragment.confidence
      };
    }

    this.currentTranscriptBuffer = merged.text;
    this.lastTranscriptActivityAt = fragment.receivedAt;
    this.rememberFragment(fingerprint, fragment.receivedAt);
    this.clearBoundaryTimer();
    this.scheduleSilenceCommit();

    if (
      this.currentSegmentStartedAt !== null &&
      fragment.receivedAt - this.currentSegmentStartedAt >= this.config.maxDurationMs &&
      this.currentTranscriptBuffer.length >= this.config.minChars
    ) {
      this.commitBuffer("max_duration");
      return this.result("appended");
    }

    while (this.currentTranscriptBuffer.length >= this.config.maxChars) {
      let cutAt = findSafeCut(this.currentTranscriptBuffer, this.config.maxChars);
      let remainingText = normalizeText(this.currentTranscriptBuffer.slice(cutAt));
      if (remainingText && remainingText.length < this.config.minChars) {
        cutAt = this.currentTranscriptBuffer.length;
        remainingText = "";
      }
      const committedText = normalizeText(this.currentTranscriptBuffer.slice(0, cutAt));
      if (!this.commitText(committedText, "max_chars")) break;
      this.currentTranscriptBuffer = remainingText;
      if (remainingText) {
        this.currentSegmentStartedAt = fragment.receivedAt;
        this.metadata = {
          provider: fragment.provider,
          confidence: fragment.confidence,
          metrics: fragment.metrics
        };
        this.scheduleMaxDurationCommit();
        this.scheduleSilenceCommit();
      } else {
        this.currentSegmentStartedAt = null;
        this.lastTranscriptActivityAt = null;
        this.metadata = null;
        this.clearTimers();
      }
    }

    if (
      this.currentTranscriptBuffer.length >= this.config.minChars &&
      ((this.config.commitOnPunctuation && TRAILING_SENTENCE_PUNCTUATION.test(this.currentTranscriptBuffer)) || fragment.speechFinal)
    ) {
      this.scheduleBoundaryCommit(fragment.speechFinal ? "silence" : "punctuation");
    }

    return this.result("appended");
  }

  flush(reason: SegmentCommitReason = "stop_flush") {
    this.clearTimers();
    const committedText = this.commitBuffer(reason);
    if (!committedText) {
      this.currentTranscriptBuffer = "";
      this.currentSegmentStartedAt = null;
      this.lastTranscriptActivityAt = null;
      this.metadata = null;
    }
    return committedText;
  }

  dispose() {
    this.clearTimers();
    this.currentTranscriptBuffer = "";
    this.currentSegmentStartedAt = null;
    this.lastTranscriptActivityAt = null;
    this.metadata = null;
    this.recentFragments.clear();
  }

  private result(disposition: TranscriptAppendResult["disposition"]): TranscriptAppendResult {
    return {
      disposition,
      currentTranscriptBuffer: this.currentTranscriptBuffer,
      currentBufferLength: this.currentTranscriptBuffer.length
    };
  }

  private rememberFragment(fingerprint: string, receivedAt: number) {
    if (!fingerprint) return;
    this.recentFragments.set(fingerprint, receivedAt);
    while (this.recentFragments.size > RECENT_FRAGMENT_LIMIT) {
      const oldestKey = this.recentFragments.keys().next().value;
      if (!oldestKey) break;
      this.recentFragments.delete(oldestKey);
    }
  }

  private scheduleBoundaryCommit(reason: SegmentCommitReason) {
    this.clearBoundaryTimer();
    this.boundaryTimer = setTimeout(() => {
      this.boundaryTimer = null;
      this.commitBuffer(reason);
    }, this.config.finalDebounceMs);
  }

  private scheduleSilenceCommit() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.commitBuffer("silence");
    }, this.config.silenceMs);
  }

  private scheduleMaxDurationCommit() {
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    this.maxDurationTimer = setTimeout(() => {
      this.maxDurationTimer = null;
      this.commitBuffer("max_duration");
    }, this.config.maxDurationMs);
  }

  private commitBuffer(reason: SegmentCommitReason) {
    const text = normalizeText(this.currentTranscriptBuffer);
    if (!this.commitText(text, reason)) return null;
    this.currentTranscriptBuffer = "";
    this.currentSegmentStartedAt = null;
    this.lastTranscriptActivityAt = null;
    this.metadata = null;
    this.clearTimers();
    return text;
  }

  private commitText(text: string, reason: SegmentCommitReason) {
    if (text.length < this.config.minChars || !this.metadata) return false;
    const completedAt = new Date();
    const startedAt = new Date(this.currentSegmentStartedAt ?? completedAt.getTime());
    const segment: CommittedTranscriptSegment = {
      sequenceId: this.nextSegmentSequenceId,
      text,
      provider: this.metadata.provider,
      confidence: this.metadata.confidence,
      reason,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      metrics: this.metadata.metrics
    };
    this.nextSegmentSequenceId += 1;
    this.onCommit(segment);
    return true;
  }

  private clearBoundaryTimer() {
    if (this.boundaryTimer) clearTimeout(this.boundaryTimer);
    this.boundaryTimer = null;
  }

  private clearTimers() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    this.clearBoundaryTimer();
    this.silenceTimer = null;
    this.maxDurationTimer = null;
  }
}
