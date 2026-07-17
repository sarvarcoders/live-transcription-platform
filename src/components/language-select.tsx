"use client";

import { Languages } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { getLocalizedLanguageLabel } from "@/lib/language-labels";
import type { LanguageCode } from "@/shared/languages";
import { SUPPORTED_LANGUAGES } from "@/shared/languages";
import { CreativeSelect } from "./ui/creative-select";

interface LanguageSelectProps {
  id: string;
  label: string;
  value: LanguageCode;
  copy: UiCopy;
  onChange: (language: LanguageCode) => void;
  disabled?: boolean;
}

export function LanguageSelect({ id, label, value, copy, onChange, disabled }: LanguageSelectProps) {
  const options = SUPPORTED_LANGUAGES.map((language) => ({
    value: language.code,
    label: getLocalizedLanguageLabel(language.code, copy),
    Icon: Languages
  }));

  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor={id}>
      {label}
      <CreativeSelect
        id={id}
        value={value}
        options={options}
        disabled={disabled}
        Icon={Languages}
        ariaLabel={label}
        onChange={onChange}
      />
    </label>
  );
}
