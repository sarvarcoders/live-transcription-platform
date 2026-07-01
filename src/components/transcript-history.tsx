"use client";

import { FileText } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import { formatTime } from "@/lib/utils";
import type { TranscriptSegment } from "@/shared/types";

export function TranscriptHistory({ segments, copy }: { segments: TranscriptSegment[]; copy: UiCopy }) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{copy.history}</h2>
        </div>
        <FileText className="h-4 w-4 text-brand-600" />
      </div>

      <div className="grid max-h-[calc(100vh-11rem)] min-h-[14rem] gap-2 overflow-auto pr-1">
        {segments.length === 0 ? (
          <div className="grid min-h-[12rem] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">{copy.transcriptWillAppear}</p>
              <p className="mt-1">{copy.finalSaved}</p>
            </div>
          </div>
        ) : (
          segments.map((segment, index) => (
            <article key={segment.id} className="rounded-xl border border-slate-200/80 bg-white/80 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-950/50">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>#{index + 1}</span>
                <span>{formatTime(segment.startedAt)}</span>
                <span>{getLocalizedLanguageLabel(segment.sourceLanguage, copy)}</span>
              </div>
              <p className="text-sm font-medium leading-6 text-slate-950 dark:text-slate-100">{segment.text}</p>
              {segment.translatedText ? (
                <p className="mt-2 border-t border-slate-200/70 pt-2 text-sm font-medium leading-6 text-brand-700 dark:border-slate-700 dark:text-cyan-200">
                  {segment.translatedText}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
