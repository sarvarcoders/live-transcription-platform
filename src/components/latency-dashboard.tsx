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
    <section className="glass-panel rounded-[1.45rem] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{copy.latencyDashboard}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{copy.latencyDescription} ({samples.length})</p>
        </div>
        <span className="glass-icon grid h-9 w-9 place-items-center rounded-2xl text-sky-700 dark:text-cyan-100">
          <Activity className="h-5 w-5" />
        </span>
      </div>

      <div className="mb-3 rounded-2xl border border-white/10 bg-slate-950/85 p-3 text-white shadow-inner backdrop-blur-xl">
        <p className="text-xs uppercase tracking-wide text-slate-300">{copy.averageEndToEnd}</p>
        <p className="mt-1 text-2xl font-bold">{formatMs(endToEndAverage)}</p>
        <p className="mt-1 text-xs text-slate-300">{copy.targetUnder}</p>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.key} className="glass-panel-soft rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{copy[row.labelKey]}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  row.isHealthy === undefined
                    ? "glass-pill text-slate-500"
                    : row.isHealthy
                      ? "glass-pill text-emerald-700 dark:text-emerald-200"
                      : "glass-pill text-amber-700 dark:text-amber-200"
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
