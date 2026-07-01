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
        <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600 dark:text-cyan-300" />
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as LanguageCode)}
          className="w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-3 pl-10 pr-10 text-sm font-semibold text-slate-950 shadow-sm outline-none transition hover:border-brand-200 hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100 dark:hover:border-cyan-700 dark:focus:ring-brand-500/20 dark:disabled:bg-slate-900"
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {getLocalizedLanguageLabel(language.code, copy)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}
