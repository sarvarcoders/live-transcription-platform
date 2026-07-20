"use client";

import { PanelRightClose, X } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary, TranscriptSegment } from "@/shared/types";
import { cn } from "@/lib/utils";
import { ExportControls } from "./export-controls";
import { ShareSession } from "./share-session";
import { TranscriptHistory } from "./transcript-history";

interface ContextSidebarProps {
  open: boolean;
  session: SessionSummary | null;
  segments: TranscriptSegment[];
  copy: UiCopy;
  onClose: () => void;
}

export function ContextSidebar({ open, session, segments, copy, onClose }: ContextSidebarProps) {
  const finalSegments = segments.filter((segment) => segment.isFinal);
  if (!session && finalSegments.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label={copy.closePanel}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm transition xl:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        aria-label={copy.sessionPanel}
        className={cn(
          "fixed inset-y-0 right-0 z-[90] order-3 grid w-[min(22rem,92vw)] content-start gap-3 overflow-y-auto border-l border-slate-200 bg-slate-100 p-3 shadow-2xl transition-transform dark:border-slate-800 dark:bg-slate-950 xl:sticky xl:top-3 xl:z-20 xl:max-h-[calc(100vh-1.5rem)] xl:w-auto xl:rounded-2xl xl:border xl:bg-transparent xl:p-0 xl:shadow-none xl:transition-none dark:xl:bg-transparent",
          open ? "translate-x-0" : "translate-x-full xl:hidden"
        )}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900 xl:bg-transparent xl:px-1 xl:shadow-none dark:xl:bg-transparent">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{copy.sessionPanel}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-100 dark:hover:bg-slate-800 dark:hover:text-white" aria-label={copy.closePanel} title={copy.closePanel}>
            <span className="xl:hidden"><X className="h-4 w-4" /></span>
            <span className="hidden xl:block"><PanelRightClose className="h-4 w-4" /></span>
          </button>
        </div>

        {session ? <ShareSession session={session} copy={copy} /> : null}
        {finalSegments.length > 0 ? (
          <>
            <ExportControls session={session} segments={finalSegments} copy={copy} />
            <TranscriptHistory segments={finalSegments} copy={copy} />
          </>
        ) : null}
      </aside>
    </>
  );
}
