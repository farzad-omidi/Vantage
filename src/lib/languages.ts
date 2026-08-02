// Languages Vantage knows about, for both the content it monitors and the
// language it writes its analysis in.
//
// `native` matters: someone picking their reading language is looking for
// "فارسی", not "Persian". `rtl` drives the `dir` attribute wherever
// model-generated or ingested text is rendered — without it Persian and Arabic
// summaries render with punctuation stranded on the wrong side.

export type LanguageCode = string;

export type Language = {
  code: LanguageCode;
  /** English name, for the analysis prompt and for scanning a list in English. */
  name: string;
  /** Endonym, shown first in pickers. */
  native: string;
  rtl?: boolean;
};

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string | null | undefined): Language | null {
  if (!code) return null;
  // Tolerate "fa-IR" / "en_US" from feeds and stored data.
  const base = code.toLowerCase().split(/[-_]/)[0];
  return BY_CODE.get(base) ?? null;
}

export function languageName(code: string | null | undefined): string {
  const lang = getLanguage(code);
  if (lang) return lang.name;
  return code ?? "Unknown";
}

/** Label for pickers: endonym first, English name after when they differ. */
export function languageLabel(lang: Language): string {
  return lang.native === lang.name ? lang.name : `${lang.native} — ${lang.name}`;
}

export function isRtl(code: string | null | undefined): boolean {
  return getLanguage(code)?.rtl === true;
}

/** `dir` attribute value for a block of text in the given language. */
export function dirFor(code: string | null | undefined): "rtl" | "ltr" {
  return isRtl(code) ? "rtl" : "ltr";
}

export const DEFAULT_LANGUAGE = "en";
