"use client";

import { Download } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary, TranscriptSegment } from "@/shared/types";
import { exportTranscriptSrt, exportTranscriptTxt } from "@/lib/exporters";
import { Button } from "./ui/button";

interface ExportControlsProps {
  session: SessionSummary | null;
  segments: TranscriptSegment[];
  copy: UiCopy;
}

export function ExportControls({ session, segments, copy }: ExportControlsProps) {
  const hasSegments = segments.some((segment) => segment.isFinal);

  return (
    <section className="grid gap-3 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.export}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{copy.exportDescription}</p>
      </div>
      <div className="grid gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!hasSegments}
          onClick={() => exportTranscriptTxt(session, segments)}
        >
          <Download className="h-4 w-4" />
          {copy.exportTxt}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasSegments}
          onClick={() => exportTranscriptSrt(session, segments)}
        >
          <Download className="h-4 w-4" />
          {copy.exportSrt}
        </Button>
      </div>
    </section>
  );
}
