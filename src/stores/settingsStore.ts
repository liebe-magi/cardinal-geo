import { create } from 'zustand';
import type { Lang } from '../lib/i18n';
import { getTranslation, type Translations } from '../lib/i18n';
import { STORAGE_KEYS } from '../lib/storage';

interface SettingsState {
  lang: Lang;
  t: Translations;
  setLang: (lang: Lang) => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const storedLang = (localStorage.getItem(STORAGE_KEYS.LANG) as Lang) || 'ja';
  return {
    lang: storedLang,
    t: getTranslation(storedLang),
    setLang: (lang: Lang) => {
      localStorage.setItem(STORAGE_KEYS.LANG, lang);
      set({ lang, t: getTranslation(lang) });
    },
  };
});
