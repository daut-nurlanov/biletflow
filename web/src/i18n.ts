import { createContext, useContext } from 'react'
import type { Lang, Translate } from '../../mobile/src/i18n/messages'
export { translate, type Lang } from '../../mobile/src/i18n/messages'

// Languages required by the SRS (non-functional requirements): English, Russian
// and Kazakh. English text is the key, so a missing translation shows English
// instead of breaking the page. Covers the attendee journey and navigation.
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'kk', label: 'ҚАЗ' },
]
export const KEY = 'biletflow.lang'

export function currentLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ru' || saved === 'kk' || saved === 'en') return saved
  } catch {
    // storage can be blocked; fall back to English
  }
  return 'en'
}

export const dateLocale = (lang: Lang = currentLang()) =>
  lang === 'ru' ? 'ru-RU' : lang === 'kk' ? 'kk-KZ' : 'en-GB'

export interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translate
}
export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n must be used inside I18nProvider')
  return v
}
