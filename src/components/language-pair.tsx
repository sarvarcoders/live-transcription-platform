"use client";

import { ArrowLeftRight, AudioLines, Languages } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/shared/languages";
import { CreativeSelect, type CreativeSelectOption } from "./ui/creative-select";

interface LanguagePairProps {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  copy: UiCopy;
  disabled?: boolean;
  onSourceLanguageChange: (language: LanguageCode) => void;
  onTargetLanguageChange: (language: LanguageCode) => void;
  onSwap: () => void;
}

export function LanguagePair({
  sourceLanguage,
  targetLanguage,
  copy,
  disabled,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onSwap
}: LanguagePairProps) {
  const sourceLabel = getLocalizedLanguageLabel(sourceLanguage, copy);
  const targetLabel = getLocalizedLanguageLabel(targetLanguage, copy);
  const sourceOptions: Array<CreativeSelectOption<LanguageCode>> = SUPPORTED_LANGUAGES.map((language) => ({
    value: language.code,
    label: getLocalizedLanguageLabel(language.code, copy),
    disabled: language.code === targetLanguage
  }));
  const targetOptions: Array<CreativeSelectOption<LanguageCode>> = SUPPORTED_LANGUAGES.map((language) => ({
    value: language.code,
    label: getLocalizedLanguageLabel(language.code, copy),
    disabled: language.code === sourceLanguage
  }));
  const summary = copy.languagePairSummary.replace("{source}", sourceLabel).replace("{target}", targetLabel);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/45">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {copy.languagePair}
        </h3>
        <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
          {sourceLanguage.toUpperCase()} / {targetLanguage.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_minmax(0,1fr)] items-end gap-1.5">
        <label className="grid min-w-0 gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor="source-language">
          <span className="flex items-center gap-1.5">
            <AudioLines className="h-3.5 w-3.5 text-cyan-500" />
            {copy.sourceLanguage}
          </span>
          <CreativeSelect
            id="source-language"
            value={sourceLanguage}
            options={sourceOptions}
            disabled={disabled}
            ariaLabel={copy.sourceLanguage}
            size="pair"
            onChange={onSourceLanguageChange}
          />
        </label>

        <button
          type="button"
          disabled={disabled}
          onClick={onSwap}
          aria-label={copy.swapLanguages}
          title={copy.swapLanguages}
          className="mb-0.5 grid h-9 w-9 place-items-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-100 focus:outline-none focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200 dark:hover:bg-cyan-400/20 dark:focus:ring-cyan-500/20"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        <label className="grid min-w-0 gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor="target-language">
          <span className="flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5 text-violet-500" />
            {copy.targetLanguageShort}
          </span>
          <CreativeSelect
            id="target-language"
            value={targetLanguage}
            options={targetOptions}
            disabled={disabled}
            ariaLabel={copy.targetLanguage}
            size="pair"
            menuAlign="right"
            onChange={onTargetLanguageChange}
          />
        </label>
      </div>

      <p className="mt-3 border-t border-slate-200/70 pt-2.5 text-xs font-medium leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {summary}
      </p>
    </section>
  );
}
