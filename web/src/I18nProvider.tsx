import { useEffect, useState, type ReactNode } from 'react'
import { I18nContext, KEY, currentLang, translate, type I18n, type Lang } from './i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  function setLang(l: Lang) {
    try {
      localStorage.setItem(KEY, l)
    } catch {
      // not saving is fine
    }
    setLangState(l)
  }
  const t: I18n['t'] = (text, vars) => translate(text, lang, vars)
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}
