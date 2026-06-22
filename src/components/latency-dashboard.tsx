"use client";

import { Activity } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { LatencyMetrics } from "@/shared/types";

interface LatencyDashboardProps {
  samples: LatencyMetrics[];
  copy: UiCopy;
}

const METRICS: Array<{ key: keyof LatencyMetrics; labelKey: "capture" | "deepgram" | "websocket" | "endToEnd"; target?: number }> = [
  { key: "speechCaptureLatencyMs", labelKey: "capture", target: 150 },
  { key: "deepgramLatencyMs", labelKey: "deepgram", target: 250 },
  { key: "websocketDeliveryLatencyMs", labelKey: "websocket", target: 80 },
  { key: "totalLatencyMs", labelKey: "endToEnd", target: 800 }
];

function valuesFor(samples: LatencyMetrics[], key: keyof LatencyMetrics) {
  return samples.map((sample) => sample[key]).filter((value): value is number => typeof value === "number" && value >= 0);
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((percentileValue / 100) * sorted.length));
  return sorted[index];
}

function formatMs(value?: number) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "-";
}

export function LatencyDashboard({ samples, copy }: LatencyDashboardProps) {
  const rows = METRICS.map((metric) => {
    const values = valuesFor(samples, metric.key);
    const avg = average(values);
    const latest = values.at(-1);
    const p95 = percentile(values, 95);
    const isHealthy = typeof avg === "number" && typeof metric.target === "number" ? avg <= metric.target : undefined;

    return {
      ...metric,
      avg,
      latest,
      p95,
      count: values.length,
      isHealthy
    };
  });

  const endToEndAverage = rows.find((row) => row.key === "totalLatencyMs")?.avg;

  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.latencyDashboard}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{copy.latencyDescription} ({samples.length})</p>
        </div>
        <Activity className="h-5 w-5 text-brand-600" />
      </div>

      <div className="mb-3 rounded-xl bg-slate-950 p-3 text-white">
        <p className="text-xs uppercase tracking-wide text-slate-300">{copy.averageEndToEnd}</p>
        <p className="mt-1 text-2xl font-bold">{formatMs(endToEndAverage)}</p>
        <p className="mt-1 text-xs text-slate-300">{copy.targetUnder}</p>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/50">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{copy[row.labelKey]}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  row.isHealthy === undefined
                    ? "bg-slate-100 text-slate-500"
                    : row.isHealthy
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {copy.avg} {formatMs(row.avg)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{copy.latest} {formatMs(row.latest)}</span>
              <span>p95 {formatMs(row.p95)}</span>
              <span>n={row.count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
