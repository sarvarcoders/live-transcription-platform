"use client";

import { Loader2, Radio, WifiOff } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { ConnectionState } from "@/shared/types";
import { cn } from "@/lib/utils";

export function ConnectionStatus({ state, message, copy }: { state: ConnectionState; message?: string; copy?: UiCopy }) {
  const isLoading = state === "connecting" || state === "reconnecting";
  const isOnline = state === "connected";
  const labels: Record<ConnectionState, string> = {
    idle: copy?.connectionIdle ?? "Idle",
    connecting: copy?.connectionConnecting ?? "Connecting",
    connected: copy?.connectionConnected ?? "Connected",
    reconnecting: copy?.connectionReconnecting ?? "Reconnecting",
    disconnected: copy?.connectionDisconnected ?? "Disconnected",
    error: copy?.connectionError ?? "Error"
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        isOnline && "border-emerald-200 bg-emerald-50 text-emerald-700",
        isLoading && "border-amber-200 bg-amber-50 text-amber-700",
        !isOnline && !isLoading && "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        state === "error" && "border-rose-200 bg-rose-50 text-rose-700"
      )}
      title={message}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isOnline ? <Radio className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {labels[state]}
    </div>
  );
}
