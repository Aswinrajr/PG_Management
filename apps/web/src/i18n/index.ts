import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import hi from './hi.json';

const STORAGE_KEY = 'roomora.lang';

export const getLanguage = () => localStorage.getItem(STORAGE_KEY) ?? 'en';

export function setLanguage(lang: string) {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
}

// English source strings are the keys, so a missing translation falls back to readable text.
void i18n.use(initReactI18next).init({
  lng: getLanguage(),
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: { translation: {} }, hi: { translation: hi } },
});

export default i18n;
