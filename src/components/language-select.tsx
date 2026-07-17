"use client";

import { ChevronDown, Languages } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import type { LanguageCode } from "@/shared/languages";
import { SUPPORTED_LANGUAGES } from "@/shared/languages";

interface LanguageSelectProps {
  id: string;
  label: string;
  value: LanguageCode;
  copy: UiCopy;
  onChange: (language: LanguageCode) => void;
  disabled?: boolean;
}

export function LanguageSelect({ id, label, value, copy, onChange, disabled }: LanguageSelectProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor={id}>
      {label}
      <span className="relative block">
        <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-600 dark:text-cyan-300" />
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as LanguageCode)}
          className="glass-field w-full appearance-none rounded-xl py-3 pl-10 pr-10 text-sm font-semibold text-slate-950 outline-none transition hover:bg-white/[0.65] focus:border-sky-300/70 focus:ring-4 focus:ring-sky-300/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-white/10"
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {getLocalizedLanguageLabel(language.code, copy)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500/80 dark:text-cyan-200/80" />
      </span>
    </label>
  );
}
