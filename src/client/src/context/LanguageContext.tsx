import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  translations,
  translate,
  setActiveLanguage,
  type Language,
  type MessageParams,
  type TranslationKey,
  type Translations,
} from '../i18n/index.ts';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  /** Looks up a key and fills `{placeholder}` params, e.g. tf('daysLeft', { days: 3 }). */
  tf: (key: TranslationKey, params?: MessageParams) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface Branding {
  title: string | null;
  tabTitle: string | null;
}

const BRANDING_CACHE_KEY = 'app_branding';

/** Last name served by this origin, so a reload does not flash the built-in name first. */
function readCachedBranding(): Branding {
  try {
    const parsed = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY) || 'null');
    return {
      title: typeof parsed?.title === 'string' ? parsed.title : null,
      tabTitle: typeof parsed?.tabTitle === 'string' ? parsed.tabTitle : null,
    };
  } catch {
    return { title: null, tabTitle: null };
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang') as Language;
      if (urlLang === 'vi' || urlLang === 'en' || urlLang === 'km') {
        localStorage.setItem('sgii_lang', urlLang);
        return urlLang;
      }
      const saved = localStorage.getItem('sgii_lang') as Language;
      if (saved === 'vi' || saved === 'en' || saved === 'km') return saved;
    }
    return 'vi';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sgii_lang', lang);
    }
  };

  const [branding, setBranding] = useState<Branding>(readCachedBranding);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/branding', { credentials: 'same-origin' })
      .then((res) => (res.ok ? (res.json() as Promise<Partial<Record<keyof Branding, unknown>>>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const next: Branding = {
          title: typeof data.title === 'string' ? data.title : null,
          tabTitle: typeof data.tabTitle === 'string' ? data.tabTitle : null,
        };
        setBranding(next);
        try {
          localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private mode); the fetched value still applies.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  setActiveLanguage(language);
  const base = translations[language] || translations.vi;
  // The organisation's name comes from the Worker (APP_TITLE / APP_TAB_TITLE), not from the language pack.
  const t = useMemo<Translations>(
    () => ({
      ...base,
      brandTitle: branding.title ?? base.brandTitle,
      tabTitle: branding.tabTitle ?? base.tabTitle,
    }),
    [base, branding]
  );
  const tf = (key: TranslationKey, params?: MessageParams) => translate(language, key, params);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tf }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
