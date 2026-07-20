"use client";

import { Bot, Cpu, DatabaseZap, Radio, Sparkles, Waves } from "lucide-react";
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
    <section className="grid min-w-0 gap-2.5">
      <div className="grid min-w-0 gap-1.5">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="stt-provider">
          {copy.sttEngine}
        </label>
        <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
          <ResolvedIcon className="h-3 w-3 text-cyan-500" />
          {copy.uses} {resolvedLabel}
        </span>
      </div>
      <CreativeSelect
        id="stt-provider"
        value={value}
        options={options}
        disabled={disabled}
        Icon={Cpu}
        ariaLabel={copy.sttEngine}
        onChange={onChange}
      />
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        {sourceLanguage === "uz" ? copy.uzbekOpenAiRoutingNote : copy.autoRoutingNote}
      </p>
    </section>
  );
}
