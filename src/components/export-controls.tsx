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
    <section className="glass-panel grid gap-2 rounded-[1.45rem] p-3">
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{copy.export}</h2>
      <div className="grid grid-cols-2 gap-2">
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
