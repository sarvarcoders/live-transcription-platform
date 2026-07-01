import type { UiCopy } from "./i18n";
import type { LanguageCode } from "@/shared/languages";

export function getLocalizedLanguageLabel(code: LanguageCode, copy: UiCopy) {
  const labels: Record<LanguageCode, string> = {
    en: copy.languageEnglish,
    ru: copy.languageRussian,
    uz: copy.languageUzbek
  };

  return labels[code];
}
