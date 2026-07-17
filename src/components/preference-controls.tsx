"use client";

import { ChevronDown, Languages, Moon, Sun } from "lucide-react";
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
      <span className="relative">
        <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-600 dark:text-cyan-300" />
        <select
          id="ui-language"
          value={locale}
          onChange={(event) => onLocaleChange(event.target.value as UiLocale)}
          className="glass-pill appearance-none rounded-full py-2 pl-9 pr-9 text-sm font-semibold text-slate-700 outline-none transition hover:-translate-y-0.5 hover:bg-white/60 focus:ring-4 focus:ring-sky-300/20 dark:text-slate-100 dark:hover:bg-white/10"
          title={copy.uiLanguage}
        >
          <option value="en">{copy.english}</option>
          <option value="uz">{copy.uzbek}</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500/80 dark:text-cyan-200/80" />
      </span>

      <button
        type="button"
        onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
        className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white/60 focus:outline-none focus:ring-4 focus:ring-sky-300/20 dark:text-slate-100 dark:hover:bg-white/10"
        title={copy.theme}
      >
        {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {theme === "light" ? copy.light : copy.dark}
      </button>
    </div>
  );
}
