import { createContext, useContext, useState, useCallback } from 'react';
import { EN } from './dict.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(localStorage.getItem('nestora_lang') || 'ru');
  const setLang = useCallback((l) => {
    const v = l === 'en' ? 'en' : 'ru';
    if (v === (localStorage.getItem('nestora_lang') || 'ru')) return;
    localStorage.setItem('nestora_lang', v);
    document.documentElement.setAttribute('lang', v);
    // Reload so the source RU text is restored / re-translated cleanly everywhere.
    location.reload();
  }, []);
  const t = useCallback((ru) => (lang === 'en' && EN[ru] != null ? EN[ru] : ru), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }
