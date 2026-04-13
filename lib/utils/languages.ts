// Supported languages — all available in ElevenLabs multilingual TTS
// Language codes follow ISO 639-1

export interface Language {
  code: string;         // ISO 639-1 code used by ElevenLabs
  label: string;        // Display name
  flag: string;         // Emoji flag
  scriptLocale: string; // Locale hint for Perplexity script generation
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English",    flag: "🇺🇸", scriptLocale: "American English" },
  { code: "es", label: "Spanish",    flag: "🇪🇸", scriptLocale: "Latin American Spanish" },
  { code: "fr", label: "French",     flag: "🇫🇷", scriptLocale: "French" },
  { code: "pt", label: "Portuguese", flag: "🇧🇷", scriptLocale: "Brazilian Portuguese" },
  { code: "de", label: "German",     flag: "🇩🇪", scriptLocale: "German" },
  { code: "it", label: "Italian",    flag: "🇮🇹", scriptLocale: "Italian" },
  { code: "pl", label: "Polish",     flag: "🇵🇱", scriptLocale: "Polish" },
  { code: "hi", label: "Hindi",      flag: "🇮🇳", scriptLocale: "Hindi" },
  { code: "ja", label: "Japanese",   flag: "🇯🇵", scriptLocale: "Japanese" },
  { code: "ko", label: "Korean",     flag: "🇰🇷", scriptLocale: "Korean" },
  { code: "zh", label: "Chinese",    flag: "🇨🇳", scriptLocale: "Mandarin Chinese" },
  { code: "ar", label: "Arabic",     flag: "🇸🇦", scriptLocale: "Modern Standard Arabic" },
  { code: "ru", label: "Russian",    flag: "🇷🇺", scriptLocale: "Russian" },
  { code: "tr", label: "Turkish",    flag: "🇹🇷", scriptLocale: "Turkish" },
  { code: "vi", label: "Vietnamese", flag: "🇻🇳", scriptLocale: "Vietnamese" },
  { code: "tl", label: "Tagalog",    flag: "🇵🇭", scriptLocale: "Filipino Tagalog" },
];

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0]; // English

export function getLanguage(code: string): Language {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE;
}
