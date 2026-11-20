import { vi, type TranslationKey, type Translations } from './vi.ts';
import { en } from './en.ts';
import { km } from './km.ts';
import { formatMessage, type MessageParams } from './format.ts';
import { serverErrorMessage, type ServerErrorBody } from './serverErrors.ts';

export type Language = 'vi' | 'en' | 'km';
export type { TranslationKey, Translations };

export const LANGUAGES: Language[] = ['vi', 'en', 'km'];

export const translations: Record<Language, Translations> = { vi, en, km };

export { formatMessage, type MessageParams };

export function translate(language: Language, key: TranslationKey, params?: MessageParams): string {
  const dict = translations[language] || translations.vi;
  return formatMessage(dict[key] ?? translations.vi[key] ?? key, params);
}

/** Each language's name in its own script, for the language switcher. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  km: 'ភាសាខ្មែរ',
};

// Language for code outside React (services, alerts). LanguageProvider keeps it in sync.
let activeLanguage: Language = 'vi';

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

/** translate() in the active language, for non-React code. Components use `t` / `tf` from useLanguage(). */
export function tr(key: TranslationKey, params?: MessageParams): string {
  return translate(activeLanguage, key, params);
}

/** Server error text in the active language (see serverErrors.ts), for non-React code. */
export function trServerError(body: ServerErrorBody | null | undefined, fallback: string): string {
  return serverErrorMessage(translations[activeLanguage] || translations.vi, body, fallback);
}

export { statusLabel, STATUS_KEYS, urgencyLabel, URGENCY_KEYS } from './statusLabels.ts';
export { seedLabel, SEED_LABELS } from './seedLabels.ts';
export { contractUrgencyLabel, documentDeadlineLabel } from './deadlineLabels.ts';
export { serverErrorMessage, SERVER_ERROR_KEYS, type ServerErrorBody } from './serverErrors.ts';
