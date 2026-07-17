"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-4",
        variant === "primary" &&
          "border border-white/50 bg-gradient-to-br from-sky-500/95 via-blue-600/95 to-indigo-600/95 text-white shadow-[0_16px_38px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.34)] hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(37,99,235,0.34)] focus:ring-sky-300/30",
        variant === "secondary" &&
          "glass-pill text-slate-700 hover:-translate-y-0.5 hover:bg-white/60 focus:ring-sky-300/20 dark:text-slate-100 dark:hover:bg-white/10",
        variant === "danger" &&
          "border border-rose-200/50 bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_16px_38px_rgba(225,29,72,0.28),inset_0_1px_0_rgba(255,255,255,0.30)] hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(225,29,72,0.34)] focus:ring-rose-300/30",
        className
      )}
      {...props}
    />
  );
}
