"use client";

import { FileText } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import { formatTime } from "@/lib/utils";
import type { TranscriptSegment } from "@/shared/types";

export function TranscriptHistory({ segments, copy }: { segments: TranscriptSegment[]; copy: UiCopy }) {
  return (
    <section className="glass-panel rounded-[1.45rem] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{copy.history}</h2>
        </div>
        <span className="glass-icon grid h-8 w-8 place-items-center rounded-xl text-sky-700 dark:text-cyan-100">
          <FileText className="h-4 w-4" />
        </span>
      </div>

      <div className="grid max-h-[calc(100vh-11rem)] min-h-[14rem] gap-2 overflow-auto pr-1">
        {segments.length === 0 ? (
          <div className="glass-panel-soft grid min-h-[12rem] place-items-center rounded-2xl p-5 text-center text-sm text-slate-500 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">{copy.transcriptWillAppear}</p>
              <p className="mt-1">{copy.finalSaved}</p>
            </div>
          </div>
        ) : (
          segments.map((segment, index) => (
            <article key={segment.id} className="glass-panel-soft rounded-2xl p-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>#{index + 1}</span>
                <span>{formatTime(segment.startedAt)}</span>
                <span>{getLocalizedLanguageLabel(segment.sourceLanguage, copy)}</span>
              </div>
              <p className="text-sm font-medium leading-6 text-slate-950 dark:text-slate-100">{segment.text}</p>
              {segment.translatedText ? (
                <p className="mt-2 border-t border-white/[0.35] pt-2 text-sm font-medium leading-6 text-sky-700 dark:border-white/10 dark:text-cyan-200">
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
