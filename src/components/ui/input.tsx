"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "glass-field w-full rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300/70 focus:ring-4 focus:ring-sky-300/20 dark:text-slate-100 dark:placeholder:text-slate-500",
        className
      )}
      {...props}
    />
  );
}
