"use client";

import { AlertTriangle, X } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";

export function LiveErrorToast({ message, copy, onDismiss }: { message: string; copy: UiCopy; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-[1200] flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-300/60 bg-slate-950 px-4 py-3 text-slate-100 shadow-2xl" role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{copy.warning}</p>
        <p className="mt-0.5 text-sm leading-5 text-slate-300">{message}</p>
      </div>
      <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label={copy.dismiss} title={copy.dismiss}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
