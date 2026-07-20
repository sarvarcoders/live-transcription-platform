"use client";

import { useState } from "react";
import { Bot, ChevronDown, Cpu, DatabaseZap, Radio, Sparkles, Waves } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { LanguageCode } from "@/shared/languages";
import type { ActiveSttProvider, SttProvider } from "@/shared/types";
import { CreativeSelect, type CreativeSelectOption } from "./ui/creative-select";

interface SttProviderSelectProps {
  sourceLanguage: LanguageCode;
  value: SttProvider;
  copy: UiCopy;
  disabled?: boolean;
  onChange: (provider: SttProvider) => void;
}

const providerIcons = {
  deepgram: Waves,
  openai: Bot,
  uzbekvoice: Radio,
  google: DatabaseZap
} satisfies Record<ActiveSttProvider, typeof Waves>;

export function SttProviderSelect({ sourceLanguage, value, copy, disabled, onChange }: SttProviderSelectProps) {
  const [advancedOpen, setAdvancedOpen] = useState(value !== "auto");
  const autoProvider: ActiveSttProvider = sourceLanguage === "uz" ? "openai" : "deepgram";
  const resolvedProvider = value === "auto" ? autoProvider : value;
  const ResolvedIcon = providerIcons[resolvedProvider];
  const resolvedLabel = resolvedProvider === "openai" ? copy.sttOpenai : resolvedProvider === "deepgram" ? copy.sttDeepgram : resolvedProvider === "uzbekvoice" ? copy.sttUzbekVoice : copy.sttGoogle;
  const autoDescription = sourceLanguage === "uz" ? copy.sttAutoUzbekDescription : copy.sttAutoEnglishRussianDescription;

  const options: Array<CreativeSelectOption<SttProvider>> = [
    { value: "auto", label: copy.sttAutoRecommended, description: autoDescription, Icon: Sparkles },
    {
      value: "deepgram",
      label: copy.sttDeepgram,
      description: sourceLanguage === "uz" ? copy.deepgramUzbekWarning : copy.sttDeepgramDescription,
      Icon: Waves,
      disabled: sourceLanguage === "uz"
    },
    { value: "openai", label: copy.sttOpenai, description: copy.sttOpenaiDescription, Icon: Bot },
    { value: "uzbekvoice", label: copy.sttUzbekVoice, description: copy.sttUzbekVoiceDescription, Icon: Radio },
    { value: "google", label: copy.sttGoogle, description: copy.sttGoogleDescription, Icon: DatabaseZap }
  ];

  return (
    <section className="grid min-w-0 gap-2 rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.sttEngine}</p>
            <p className="text-sm font-bold leading-5 text-slate-900 dark:text-white">
              {value === "auto" ? `${copy.sttAutoRecommended} - ${copy.recommended}` : resolvedLabel}
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
          <ResolvedIcon className="h-3 w-3" />
          {resolvedLabel}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        {sourceLanguage === "uz" ? copy.uzbekOpenAiRoutingNote : copy.autoRoutingNote}
      </p>
      <button
        type="button"
        onClick={() => setAdvancedOpen((current) => !current)}
        aria-expanded={advancedOpen}
        className="flex items-center justify-between gap-2 rounded-lg py-1 text-xs font-bold text-slate-600 outline-none transition hover:text-slate-950 focus:ring-4 focus:ring-brand-100 dark:text-slate-300 dark:hover:text-white dark:focus:ring-brand-500/20"
      >
        <span className="inline-flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" />{copy.advanced}</span>
        <ChevronDown className={`h-4 w-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
      </button>
      {advancedOpen ? (
        <div className="grid gap-1.5 border-t border-slate-200/80 pt-2 dark:border-slate-800">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="stt-provider">{copy.manualEngineSelection}</label>
          <CreativeSelect
            id="stt-provider"
            value={value}
            options={options}
            disabled={disabled}
            Icon={Cpu}
            ariaLabel={copy.sttEngine}
            onChange={onChange}
          />
        </div>
      ) : null}
    </section>
  );
}
