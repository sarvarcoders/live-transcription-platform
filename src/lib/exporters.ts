import type { SessionSummary, TranscriptSegment } from "@/shared/types";
import { getLanguageLabel } from "@/shared/languages";

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

function filenameSafe(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "session";
}

function srtTimestamp(totalMilliseconds: number) {
  const milliseconds = Math.max(0, Math.floor(totalMilliseconds));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isExportableSegment(segment: TranscriptSegment) {
  return segment.isFinal && segment.translationStatus === "complete" && Boolean(segment.translatedText);
}

export function exportTranscriptTxt(session: SessionSummary | null, segments: TranscriptSegment[]) {
  const title = session?.title ?? "Live Transcription Session";
  const source = session ? getLanguageLabel(session.sourceLanguage) : "Transcript";
  const target = session ? getLanguageLabel(session.targetLanguage) : "Translation";
  const header = [
    title,
    session ? `Session: ${session.id}` : null,
    `Route: ${source} -> ${target}`,
    `Exported: ${new Date().toISOString()}`
  ]
    .filter(Boolean)
    .join("\n");

  const body = segments
    .filter(isExportableSegment)
    .map((segment, index) => {
      const translation = segment.translatedText ? `\n${target}: ${segment.translatedText}` : "";
      return `${index + 1}. [${new Date(segment.startedAt).toLocaleTimeString()}]\n${source}: ${segment.text}${translation}`;
    })
    .join("\n\n");

  downloadTextFile(`${filenameSafe(title)}-${session?.id ?? "transcript"}.txt`, `${header}\n\n${body}\n`);
}

export function exportTranscriptSrt(session: SessionSummary | null, segments: TranscriptSegment[]) {
  const finalSegments = segments.filter(isExportableSegment);
  const baseTime = finalSegments[0]?.startedAt ? new Date(finalSegments[0].startedAt).getTime() : Date.now();

  const content = finalSegments
    .map((segment, index) => {
      const start = Math.max(0, new Date(segment.startedAt).getTime() - baseTime);
      const nextStart = finalSegments[index + 1]?.startedAt
        ? new Date(finalSegments[index + 1].startedAt).getTime() - baseTime
        : start + 3000;
      const end = Math.max(start + 1200, nextStart - 150);
      const translation = segment.translatedText ? `\n${segment.translatedText}` : "";
      return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${segment.text}${translation}`;
    })
    .join("\n\n");

  downloadTextFile(`${filenameSafe(session?.title ?? "subtitles")}-${session?.id ?? "session"}.srt`, `${content}\n`);
}
