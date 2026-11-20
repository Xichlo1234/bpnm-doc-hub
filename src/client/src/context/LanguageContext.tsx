import React, { createContext, useContext, useState } from 'react';
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

  setActiveLanguage(language);
  const t = translations[language] || translations.vi;
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
