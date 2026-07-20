import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { TranscriptSegmenter, type CommittedTranscriptSegment } from "./transcript-segmenter";

function createSegmenter(
  commits: CommittedTranscriptSegment[],
  overrides: Partial<ConstructorParameters<typeof TranscriptSegmenter>[0]> = {}
) {
  return new TranscriptSegmenter(
    {
      commitOnPunctuation: true,
      silenceMs: 40,
      minChars: 8,
      maxChars: 140,
      maxDurationMs: 7000,
      finalDebounceMs: 0,
      ...overrides
    },
    (segment) => commits.push(segment)
  );
}

test("commits a complete sentence on punctuation", async () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits);
  const now = Date.now();

  segmenter.append({ text: "This is", provider: "deepgram", receivedAt: now });
  segmenter.append({ text: "a complete sentence.", provider: "deepgram", receivedAt: now + 20 });
  await delay(10);

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.text, "This is a complete sentence.");
  assert.equal(commits[0]?.reason, "punctuation");
  segmenter.dispose();
});

test("deduplicates suffix-prefix overlap between chunked STT fragments", () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits);
  const now = Date.now();

  segmenter.append({ text: "Bu juda yaxshi test", provider: "openai", receivedAt: now });
  segmenter.append({ text: "yaxshi test davom etadi", provider: "openai", receivedAt: now + 100 });
  segmenter.flush("stop_flush");

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.text, "Bu juda yaxshi test davom etadi");
  segmenter.dispose();
});

test("commits buffered speech after transcript silence", async () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits, { silenceMs: 15 });

  segmenter.append({ text: "Meaningful phrase without punctuation", provider: "openai", receivedAt: Date.now() });
  await delay(30);

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.reason, "silence");
  segmenter.dispose();
});

test("commits continuous speech at the maximum segment duration", () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits, { maxDurationMs: 1000, silenceMs: 5000 });
  const now = Date.now();

  segmenter.append({ text: "Continuous speech begins here", provider: "deepgram", receivedAt: now });
  segmenter.append({ text: "and continues with useful context", provider: "deepgram", receivedAt: now + 1001 });

  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.reason, "max_duration");
  assert.equal(commits[0]?.text, "Continuous speech begins here and continues with useful context");
  segmenter.dispose();
});

test("skips an identical repeated STT chunk", () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits);
  const now = Date.now();

  segmenter.append({ text: "Takrorlangan audio bo'lagi", provider: "openai", receivedAt: now });
  const repeated = segmenter.append({ text: "Takrorlangan audio bo'lagi", provider: "openai", receivedAt: now + 100 });
  segmenter.flush("stop_flush");

  assert.equal(repeated.disposition, "deduplicated");
  assert.equal(commits.length, 1);
  assert.equal(commits[0]?.text, "Takrorlangan audio bo'lagi");
  segmenter.dispose();
});

test("uses a bounded character commit without losing remaining words", () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits, { minChars: 4, maxChars: 24 });

  segmenter.append({
    text: "one two three four five six seven eight nine ten",
    provider: "deepgram",
    receivedAt: Date.now()
  });
  segmenter.flush("stop_flush");

  assert.ok(commits.length >= 2);
  assert.equal(commits.map((segment) => segment.text).join(" "), "one two three four five six seven eight nine ten");
  assert.equal(commits[0]?.reason, "max_chars");
  segmenter.dispose();
});

test("drops an extremely short stop fragment as noise", () => {
  const commits: CommittedTranscriptSegment[] = [];
  const segmenter = createSegmenter(commits, { minChars: 12 });

  segmenter.append({ text: "uh", provider: "deepgram", receivedAt: Date.now() });
  segmenter.flush("stop_flush");

  assert.equal(commits.length, 0);
  assert.equal(segmenter.currentTranscriptBuffer, "");
  segmenter.dispose();
});
