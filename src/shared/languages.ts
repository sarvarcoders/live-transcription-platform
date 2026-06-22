export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", deepgramCode: "en" },
  { code: "ru", label: "Russian", deepgramCode: "ru" },
  { code: "uz", label: "Uzbek", deepgramCode: "uz" }
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function getLanguageLabel(code: LanguageCode) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

export function getDeepgramLanguage(code: LanguageCode) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.deepgramCode ?? code;
}

export function isLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value);
}
