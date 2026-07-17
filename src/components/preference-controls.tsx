"use client";

import { Languages, Moon, Sun } from "lucide-react";
import type { UiCopy, UiLocale, UiTheme } from "@/lib/i18n";
import { CreativeSelect } from "./ui/creative-select";

interface PreferenceControlsProps {
  locale: UiLocale;
  theme: UiTheme;
  copy: UiCopy;
  onLocaleChange: (locale: UiLocale) => void;
  onThemeChange: (theme: UiTheme) => void;
}

export function PreferenceControls({ locale, theme, copy, onLocaleChange, onThemeChange }: PreferenceControlsProps) {
  const languageOptions = [
    { value: "en" as const, label: copy.english, Icon: Languages },
    { value: "uz" as const, label: copy.uzbek, Icon: Languages }
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="ui-language">
        {copy.uiLanguage}
      </label>
      <div className="w-[9.75rem]">
        <CreativeSelect
          id="ui-language"
          value={locale}
          options={languageOptions}
          Icon={Languages}
          ariaLabel={copy.uiLanguage}
          size="compact"
          menuAlign="right"
          onChange={onLocaleChange}
        />
      </div>

      <button
        type="button"
        onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-brand-500/20"
        title={copy.theme}
      >
        {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {theme === "light" ? copy.light : copy.dark}
      </button>
    </div>
  );
}
