import { createContext, useContext } from 'react'

// Languages required by the SRS (non-functional requirements): English, Russian
// and Kazakh. English text is the key, so a missing translation shows English
// instead of breaking the page. Covers the attendee journey and navigation.
export type Lang = 'en' | 'ru' | 'kk'
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

type Entry = { ru: string; kk: string }
const dict: Record<string, Entry> = {
  // navigation
  'My tickets': { ru: 'Мои билеты', kk: 'Менің билеттерім' },
  'My orders': { ru: 'Мои заказы', kk: 'Менің тапсырыстарым' },
  'Support': { ru: 'Поддержка', kk: 'Қолдау' },
  'Notifications': { ru: 'Уведомления', kk: 'Хабарландырулар' },
  'Admin portal': { ru: 'Портал администратора', kk: 'Әкімші порталы' },
  'Organizer dashboard': { ru: 'Кабинет организатора', kk: 'Ұйымдастырушы кабинеті' },
  'Sign out': { ru: 'Выйти', kk: 'Шығу' },
  'Sign in': { ru: 'Войти', kk: 'Кіру' },
  'Register': { ru: 'Регистрация', kk: 'Тіркелу' },
  'Your email is not verified.': { ru: 'Ваша почта не подтверждена.', kk: 'Электрондық поштаңыз расталмаған.' },
  'Verify email': { ru: 'Подтвердить почту', kk: 'Поштаны растау' },
  'Language': { ru: 'Язык', kk: 'Тіл' },
  'to see your tickets.': { ru: 'чтобы увидеть свои билеты.', kk: 'билеттеріңізді көру үшін.' },
  'to see your orders.': { ru: 'чтобы увидеть свои заказы.', kk: 'тапсырыстарыңызды көру үшін.' },
  // events
  'Events': { ru: 'События', kk: 'Іс-шаралар' },
  'No upcoming events.': { ru: 'Предстоящих событий нет.', kk: 'Алдағы іс-шаралар жоқ.' },
  'Loading…': { ru: 'Загрузка…', kk: 'Жүктелуде…' },
  // sign in / register
  'Email': { ru: 'Эл. почта', kk: 'Электрондық пошта' },
  'Password': { ru: 'Пароль', kk: 'Құпия сөз' },
  'Signing in…': { ru: 'Вход…', kk: 'Кіруде…' },
  'No account?': { ru: 'Нет аккаунта?', kk: 'Аккаунтыңыз жоқ па?' },
  'Forgot password?': { ru: 'Забыли пароль?', kk: 'Құпия сөзді ұмыттыңыз ба?' },
  'Create an account': { ru: 'Создать аккаунт', kk: 'Аккаунт жасау' },
  'Full name': { ru: 'Полное имя', kk: 'Толық аты-жөні' },
  'Password (8+ characters)': { ru: 'Пароль (8+ символов)', kk: 'Құпия сөз (8+ таңба)' },
  'Creating…': { ru: 'Создание…', kk: 'Жасалуда…' },
  'Create account': { ru: 'Создать аккаунт', kk: 'Аккаунт жасау' },
  'Already have an account?': { ru: 'Уже есть аккаунт?', kk: 'Аккаунтыңыз бар ма?' },
  // event page
  'Refund policy: {v}': { ru: 'Политика возврата: {v}', kk: 'Қайтару саясаты: {v}' },
  'Report this event': { ru: 'Пожаловаться на событие', kk: 'Іс-шараға шағымдану' },
  'Why are you reporting this event?': { ru: 'Почему вы жалуетесь на это событие?', kk: 'Бұл іс-шараға неге шағымданасыз?' },
  'Sending…': { ru: 'Отправка…', kk: 'Жіберілуде…' },
  'Send report': { ru: 'Отправить жалобу', kk: 'Шағымды жіберу' },
  'Cancel': { ru: 'Отмена', kk: 'Бас тарту' },
  'Tickets': { ru: 'Билеты', kk: 'Билеттер' },
  'Sold out': { ru: 'Распродано', kk: 'Сатылып біткен' },
  '{n} left': { ru: 'Осталось: {n}', kk: 'Қалды: {n}' },
  'paid sales not available': { ru: 'платные продажи недоступны', kk: 'ақылы сату қолжетімсіз' },
  'Checkout': { ru: 'Оформление заказа', kk: 'Тапсырысты рәсімдеу' },
  'Name on the ticket': { ru: 'Имя на билете', kk: 'Билеттегі аты' },
  'Quantity (up to {n})': { ru: 'Количество (до {n})', kk: 'Саны ({n} дейін)' },
  'Promo code': { ru: 'Промокод', kk: 'Промокод' },
  'Apply': { ru: 'Применить', kk: 'Қолдану' },
  'Calculating price…': { ru: 'Расчёт цены…', kk: 'Баға есептелуде…' },
  'Retry quote': { ru: 'Повторить расчёт', kk: 'Есепті қайталау' },
  'Subtotal': { ru: 'Промежуточный итог', kk: 'Аралық сома' },
  'Discount': { ru: 'Скидка', kk: 'Жеңілдік' },
  'Total': { ru: 'Итого', kk: 'Барлығы' },
  'Demo checkout: payment is simulated. No real money is charged. Processing fees are paid by the organizer.': {
    ru: 'Демо-оплата: платёж имитируется. Реальные деньги не списываются. Комиссию за обработку платит организатор.',
    kk: 'Демо төлем: төлем имитацияланады. Нақты ақша алынбайды. Өңдеу комиссиясын ұйымдастырушы төлейді.',
  },
  'Processing…': { ru: 'Обработка…', kk: 'Өңделуде…' },
  'Buy': { ru: 'Купить', kk: 'Сатып алу' },
  'Sign in to buy': { ru: 'Войдите, чтобы купить', kk: 'Сатып алу үшін кіріңіз' },
  // tickets and orders
  'You have no tickets yet.': { ru: 'У вас пока нет билетов.', kk: 'Сізде әлі билет жоқ.' },
  'Purchase successful. Your ticket is below.': { ru: 'Покупка прошла успешно. Ваш билет ниже.', kk: 'Сатып алу сәтті өтті. Билетіңіз төменде.' },
  'Download PDF': { ru: 'Скачать PDF', kk: 'PDF жүктеу' },
  'Get help with this ticket': { ru: 'Помощь по этому билету', kk: 'Осы билет бойынша көмек' },
  'Get help with this order': { ru: 'Помощь по этому заказу', kk: 'Осы тапсырыс бойынша көмек' },
  'Section {s}, row {r}, seat {n}': { ru: 'Секция {s}, ряд {r}, место {n}', kk: 'Секция {s}, қатар {r}, орын {n}' },
  'Admission QR unavailable: {v}.': { ru: 'QR-код входа недоступен: {v}.', kk: 'Кіру QR-коды қолжетімсіз: {v}.' },
  'event cancelled': { ru: 'событие отменено', kk: 'іс-шара бас тартылды' },
  'event suspended': { ru: 'событие приостановлено', kk: 'іс-шара тоқтатылды' },
  'You have no orders yet.': { ru: 'У вас пока нет заказов.', kk: 'Сізде әлі тапсырыс жоқ.' },
  'Browse events': { ru: 'Смотреть события', kk: 'Іс-шараларды қарау' },
  '{n} ticket': { ru: '{n} билет', kk: '{n} билет' },
  '{n} tickets': { ru: 'Билетов: {n}', kk: 'Билеттер: {n}' },
  'Promo code: {v}': { ru: 'Промокод: {v}', kk: 'Промокод: {v}' },
  'Ordered {v}': { ru: 'Заказ от {v}', kk: 'Тапсырыс күні: {v}' },
  'Order reference: {v}': { ru: 'Номер заказа: {v}', kk: 'Тапсырыс нөмірі: {v}' },
  'Cancel registration': { ru: 'Отменить регистрацию', kk: 'Тіркеуді болдырмау' },
  'Cancel this registration? Your tickets stop working.': { ru: 'Отменить эту регистрацию? Билеты перестанут действовать.', kk: 'Бұл тіркеуді болдырмайсыз ба? Билеттер жарамсыз болады.' },
  'Yes, cancel': { ru: 'Да, отменить', kk: 'Иә, болдырмау' },
  'Cancelling…': { ru: 'Отмена…', kk: 'Болдырмауда…' },
  'Keep it': { ru: 'Оставить', kk: 'Қалдыру' },
  'Paid orders are refunded by the organizer. Ask for a refund through support.': {
    ru: 'Возврат платных заказов делает организатор. Запросите возврат через поддержку.',
    kk: 'Ақылы тапсырыстың ақшасын ұйымдастырушы қайтарады. Қолдау арқылы сұраңыз.',
  },
  // statuses
  'Valid': { ru: 'Действителен', kk: 'Жарамды' },
  'Checked in': { ru: 'Использован', kk: 'Пайдаланылған' },
  'Cancelled': { ru: 'Отменён', kk: 'Бас тартылған' },
  'Refunded': { ru: 'Возвращён', kk: 'Қайтарылған' },
  'Paid': { ru: 'Оплачен', kk: 'Төленген' },
  'Registered': { ru: 'Зарегистрирован', kk: 'Тіркелген' },
}

export interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (text: string, vars?: Record<string, string | number>) => string
}
export const I18nContext = createContext<I18n | null>(null)

export function translate(text: string, lang: Lang, vars?: Record<string, string | number>) {
  let out = lang === 'en' ? text : (dict[text]?.[lang] ?? text)
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export function useI18n(): I18n {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n must be used inside I18nProvider')
  return v
}
