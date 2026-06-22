"use client";

import { Moon, Sun } from "lucide-react";
import type { UiCopy, UiLocale, UiTheme } from "@/lib/i18n";

interface PreferenceControlsProps {
  locale: UiLocale;
  theme: UiTheme;
  copy: UiCopy;
  onLocaleChange: (locale: UiLocale) => void;
  onThemeChange: (theme: UiTheme) => void;
}

export function PreferenceControls({ locale, theme, copy, onLocaleChange, onThemeChange }: PreferenceControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="ui-language">
        {copy.uiLanguage}
      </label>
      <select
        id="ui-language"
        value={locale}
        onChange={(event) => onLocaleChange(event.target.value as UiLocale)}
        className="rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
        title={copy.uiLanguage}
      >
        <option value="en">{copy.english}</option>
        <option value="uz">{copy.uzbek}</option>
      </select>

      <button
        type="button"
        onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
        title={copy.theme}
      >
        {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {theme === "light" ? copy.light : copy.dark}
      </button>
    </div>
  );
}
