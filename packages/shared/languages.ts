/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */

/** Curated intersection of Azure real-time STT, Translator, and neural TTS.
 * https://learn.microsoft.com/azure/ai-services/speech-service/language-support
 * https://learn.microsoft.com/azure/ai-services/translator/language-support
 * Locale support is explicit: Urdu recognition uses ur-IN, synthesis ur-PK.
 */
export interface SupportedLanguage {
  code: string;
  name: string;
  sttLocale: string;
  ttsLocale: string;
  defaultVoiceId: string;
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  {
    code: 'ur',
    name: 'Urdu',
    sttLocale: 'ur-IN',
    ttsLocale: 'ur-PK',
    defaultVoiceId: 'ur-PK-UzmaNeural',
    direction: 'rtl',
  },
  {
    code: 'en',
    name: 'English',
    sttLocale: 'en-US',
    ttsLocale: 'en-US',
    defaultVoiceId: 'en-US-JennyNeural',
    direction: 'ltr',
  },
  {
    code: 'tr',
    name: 'Turkish',
    sttLocale: 'tr-TR',
    ttsLocale: 'tr-TR',
    defaultVoiceId: 'tr-TR-EmelNeural',
    direction: 'ltr',
  },
  {
    code: 'ar',
    name: 'Arabic',
    sttLocale: 'ar-SA',
    ttsLocale: 'ar-SA',
    defaultVoiceId: 'ar-SA-ZariyahNeural',
    direction: 'rtl',
  },
  {
    code: 'hi',
    name: 'Hindi',
    sttLocale: 'hi-IN',
    ttsLocale: 'hi-IN',
    defaultVoiceId: 'hi-IN-SwaraNeural',
    direction: 'ltr',
  },
  {
    code: 'es',
    name: 'Spanish',
    sttLocale: 'es-ES',
    ttsLocale: 'es-ES',
    defaultVoiceId: 'es-ES-ElviraNeural',
    direction: 'ltr',
  },
  {
    code: 'fr',
    name: 'French',
    sttLocale: 'fr-FR',
    ttsLocale: 'fr-FR',
    defaultVoiceId: 'fr-FR-DeniseNeural',
    direction: 'ltr',
  },
  {
    code: 'de',
    name: 'German',
    sttLocale: 'de-DE',
    ttsLocale: 'de-DE',
    defaultVoiceId: 'de-DE-KatjaNeural',
    direction: 'ltr',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    sttLocale: 'pt-BR',
    ttsLocale: 'pt-BR',
    defaultVoiceId: 'pt-BR-FranciscaNeural',
    direction: 'ltr',
  },
  {
    code: 'ru',
    name: 'Russian',
    sttLocale: 'ru-RU',
    ttsLocale: 'ru-RU',
    defaultVoiceId: 'ru-RU-SvetlanaNeural',
    direction: 'ltr',
  },
  {
    code: 'ja',
    name: 'Japanese',
    sttLocale: 'ja-JP',
    ttsLocale: 'ja-JP',
    defaultVoiceId: 'ja-JP-NanamiNeural',
    direction: 'ltr',
  },
  {
    code: 'zh-Hans',
    name: 'Chinese (Mandarin)',
    sttLocale: 'zh-CN',
    ttsLocale: 'zh-CN',
    defaultVoiceId: 'zh-CN-XiaoxiaoNeural',
    direction: 'ltr',
  },
];

export function getLanguage(codeOrLocale: string | null | undefined): SupportedLanguage | undefined {
  if (typeof codeOrLocale !== 'string') return undefined;
  const value = codeOrLocale.trim().replace(/_/g, '-').toLowerCase();
  return SUPPORTED_LANGUAGES.find((language) =>
    [language.code, language.sttLocale, language.ttsLocale].some((id) => id.toLowerCase() === value),
  );
}

export function requireLanguage(codeOrLocale: string): SupportedLanguage {
  const language = getLanguage(codeOrLocale);
  if (!language)
    throw new Error(`Unsupported language: ${String(codeOrLocale)}. Choose a language from the list.`);
  return language;
}

export function defaultVoiceForLanguage(codeOrLocale: string): string {
  return requireLanguage(codeOrLocale).defaultVoiceId;
}

/** The curated voices are single-language voices; match language, not region. */
export function voiceMatchesLanguage(voiceId: string | undefined | null, codeOrLocale: string): boolean {
  const language = requireLanguage(codeOrLocale);
  return (
    typeof voiceId === 'string' &&
    voiceId.toLowerCase().startsWith(`${language.ttsLocale.split('-')[0].toLowerCase()}-`)
  );
}

export interface TranslationLanguages {
  sourceLanguage?: string;
  targetLanguage?: string;
}

export function resolveTranslationLanguages(languages: TranslationLanguages = {}): {
  sourceLanguage: string;
  targetLanguage: string;
} {
  return {
    sourceLanguage: requireLanguage(languages.sourceLanguage ?? 'ur').code,
    targetLanguage: requireLanguage(languages.targetLanguage ?? 'en').code,
  };
}
