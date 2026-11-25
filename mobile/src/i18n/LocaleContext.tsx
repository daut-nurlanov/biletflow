import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { translate, type Lang, type Translate } from "./messages";

const KEY = "biletflow.lang";
const english: Translate = (text, vars) => translate(text, "en", vars);
const LocaleContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: Translate }>({
  lang: "en", t: english, setLang: () => {},
});
const isLanguage = (value: string | null): value is Lang => value === "en" || value === "ru" || value === "kk";

export const localeNames: Record<Lang, string> = { en: "English", ru: "Русский", kk: "Қазақша" };

export function LocaleProvider({ children }: PropsWithChildren) {
  const [lang, setLanguage] = useState<Lang>("en");
  const changed = useRef(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const stored = Platform.OS === "web" ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
        if (active && !changed.current && isLanguage(stored)) setLanguage(stored);
      } catch { /* The app is usable even if local storage is disabled. */ }
    }
    void restore();
    return () => { active = false; };
  }, []);

  const setLang = useCallback((next: Lang) => {
    changed.current = true;
    setLanguage(next);
    queue.current = queue.current.then(async () => {
      if (Platform.OS === "web") localStorage.setItem(KEY, next);
      else await SecureStore.setItemAsync(KEY, next);
    }).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: (text: string, vars?: Record<string, string | number>) =>
    translate(text, lang, vars) }), [lang, setLang]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
