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
  'This is a draft preview. Tickets go on sale after publication.': { ru: 'Это предварительный просмотр черновика. Продажа билетов начнётся после публикации.', kk: 'Бұл жарияланбаған нұсқаның алдын ала көрінісі. Билеттер жарияланғаннан кейін сатылымға шығады.' },
  'This event was cancelled.': { ru: 'Это событие отменено.', kk: 'Бұл іс-шара тоқтатылды.' },
  'This event has ended.': { ru: 'Это событие завершилось.', kk: 'Бұл іс-шара аяқталды.' },
  'Tickets are unavailable for this event.': { ru: 'Билеты на это событие недоступны.', kk: 'Бұл іс-шараға билеттер қолжетімсіз.' },
  'Registration opens {v}.': { ru: 'Регистрация откроется {v}.', kk: 'Тіркелу {v} ашылады.' },
  'Registration is closed.': { ru: 'Регистрация закрыта.', kk: 'Тіркелу жабық.' },
  'Ticket sales open {v}.': { ru: 'Продажа билетов начнётся {v}.', kk: 'Билет сатылымы {v} басталады.' },
  'Sales have ended.': { ru: 'Продажа завершена.', kk: 'Сатылым аяқталды.' },
  'Hidden from buyers': { ru: 'Скрыто для покупателей', kk: 'Сатып алушыларға көрсетілмейді' },
  'Past event': { ru: 'Прошедшее событие', kk: 'Өткен іс-шара' },
  'Open ticket for {v}, ending {n}': { ru: 'Открыть билет на «{v}», последние символы {n}', kk: '«{v}» билетін ашу, соңғы таңбалары {n}' },
  'Preparing calendar…': { ru: 'Подготовка календаря…', kk: 'Күнтізбе дайындалуда…' },
  'Download calendar cancellation (.ics)': { ru: 'Скачать отмену события (.ics)', kk: 'Іс-шараның тоқтатылуын жүктеу (.ics)' },
  'Add to calendar (.ics)': { ru: 'Добавить в календарь (.ics)', kk: 'Күнтізбеге қосу (.ics)' },
  'Calendar file prepared. Open the downloaded .ics file in your calendar app.': { ru: 'Откройте скачанный файл .ics в приложении календаря.', kk: 'Жүктелген .ics файлын күнтізбе қолданбасында ашыңыз.' },
  'Calendar file prepared. Open the downloaded .ics file in your calendar app to update the cancelled event.': { ru: 'Откройте скачанный файл .ics в календаре, чтобы обновить отменённое событие.', kk: 'Тоқтатылған іс-шараны жаңарту үшін жүктелген .ics файлын күнтізбеде ашыңыз.' },
  'Skip to main content': { ru: 'Перейти к основному содержанию', kk: 'Негізгі мазмұнға өту' },
  'Main navigation': { ru: 'Основная навигация', kk: 'Негізгі навигация' },
  'Menu': { ru: 'Меню', kk: 'Мәзір' },
  'Close': { ru: 'Закрыть', kk: 'Жабу' },
  'Find your next event': { ru: 'Найдите своё следующее событие', kk: 'Келесі іс-шараңызды табыңыз' },
  'Discover live events, local meetups, and more across Kazakhstan.': { ru: 'Концерты, встречи и другие события по всему Казахстану.', kk: 'Қазақстан бойынша концерттер, кездесулер және басқа іс-шаралар.' },
  'Search events': { ru: 'Поиск событий', kk: 'Іс-шараларды іздеу' },
  'Search by event, venue, or category': { ru: 'Событие, место или категория', kk: 'Іс-шара, орын немесе санат' },
  'Event category': { ru: 'Категория события', kk: 'Іс-шара санаты' },
  'All categories': { ru: 'Все категории', kk: 'Барлық санаттар' },
  'No events match your search.': { ru: 'По вашему запросу ничего не найдено.', kk: 'Іздеуіңізге сәйкес іс-шара табылмады.' },
  'View tickets': { ru: 'Смотреть билеты', kk: 'Билеттерді қарау' },
  'Remove promotion': { ru: 'Убрать промокод', kk: 'Промокодты өшіру' },
  'From {v}': { ru: 'От {v}', kk: '{v} бастап' },
  'Free': { ru: 'Бесплатно', kk: 'Тегін' },
  'About the event': { ru: 'О событии', kk: 'Іс-шара туралы' },
  'Fee paid by organizer': { ru: 'Комиссию платит организатор', kk: 'Комиссияны ұйымдастырушы төлейді' },
  'Try again': { ru: 'Повторить', kk: 'Қайталап көру' },
  'Event': { ru: 'Событие', kk: 'Іс-шара' },
  'Upcoming tickets': { ru: 'Билеты на предстоящие события', kk: 'Алдағы іс-шаралардың билеттері' },
  'Past and inactive tickets': { ru: 'Прошедшие и неактивные билеты', kk: 'Өткен және жарамсыз билеттер' },
  'Open ticket': { ru: 'Открыть билет', kk: 'Билетті ашу' },
  'Admission QR for {v}': { ru: 'QR-код для прохода на «{v}»', kk: '«{v}» іс-шарасына кіру QR коды' },
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
  // account recovery and verification
  'Verify your email': { ru: 'Подтвердите электронную почту', kk: 'Электрондық поштаңызды растаңыз' },
  'In this demo, verification codes arrive as notifications instead of email.': {
    ru: 'В этой демоверсии коды подтверждения приходят в уведомлениях, а не по электронной почте.',
    kk: 'Бұл демо-нұсқада растау кодтары электрондық поштаға емес, хабарландыруларға келеді.',
  },
  'Please enter your verification code.': { ru: 'Введите код подтверждения.', kk: 'Растау кодын енгізіңіз.' },
  'Could not verify your email': { ru: 'Не удалось подтвердить электронную почту', kk: 'Электрондық поштаны растау мүмкін болмады' },
  'Could not send a new verification code': { ru: 'Не удалось отправить новый код подтверждения', kk: 'Жаңа растау кодын жіберу мүмкін болмады' },
  'Back to events': { ru: 'Вернуться к событиям', kk: 'Іс-шараларға оралу' },
  'Verification code': { ru: 'Код подтверждения', kk: 'Растау коды' },
  'Verifying…': { ru: 'Проверка…', kk: 'Тексерілуде…' },
  'Send a new code': { ru: 'Отправить новый код', kk: 'Жаңа код жіберу' },
  'If that email has an account, a reset code was sent.': {
    ru: 'Если для этой почты есть аккаунт, код сброса был отправлен.',
    kk: 'Егер бұл поштаға тіркелген аккаунт болса, қалпына келтіру коды жіберілді.',
  },
  'Forgot password': { ru: 'Забыли пароль', kk: 'Құпия сөзді ұмыттыңыз' },
  'In this demo, reset codes arrive as notifications instead of email.': {
    ru: 'В этой демоверсии коды сброса приходят в уведомлениях, а не по электронной почте.',
    kk: 'Бұл демо-нұсқада қалпына келтіру кодтары электрондық поштаға емес, хабарландыруларға келеді.',
  },
  'Send reset code': { ru: 'Отправить код сброса', kk: 'Қалпына келтіру кодын жіберу' },
  'I have a reset code': { ru: 'У меня есть код сброса', kk: 'Менде қалпына келтіру коды бар' },
  'Please enter your reset code.': { ru: 'Введите код сброса.', kk: 'Қалпына келтіру кодын енгізіңіз.' },
  'Password must be at least 8 characters.': { ru: 'Пароль должен содержать не менее 8 символов.', kk: 'Құпия сөз кемінде 8 таңбадан тұруы керек.' },
  'Password is too long; use at most 72 bytes.': { ru: 'Пароль слишком длинный; используйте не более 72 байт.', kk: 'Құпия сөз тым ұзын; 72 байттан аспауы керек.' },
  'Passwords do not match.': { ru: 'Пароли не совпадают.', kk: 'Құпия сөздер сәйкес келмейді.' },
  'Could not reset your password': { ru: 'Не удалось изменить пароль', kk: 'Құпия сөзді өзгерту мүмкін болмады' },
  'Reset password': { ru: 'Сбросить пароль', kk: 'Құпия сөзді қалпына келтіру' },
  'Reset code': { ru: 'Код сброса', kk: 'Қалпына келтіру коды' },
  'New password': { ru: 'Новый пароль', kk: 'Жаңа құпия сөз' },
  'Confirm new password': { ru: 'Подтвердите новый пароль', kk: 'Жаңа құпия сөзді растаңыз' },
  'Changing…': { ru: 'Изменение…', kk: 'Өзгертілуде…' },
  'Change password': { ru: 'Изменить пароль', kk: 'Құпия сөзді өзгерту' },
  // event page
  'Refund policy: {v}': { ru: 'Политика возврата: {v}', kk: 'Қайтару саясаты: {v}' },
  'Report this event': { ru: 'Пожаловаться на событие', kk: 'Іс-шараға шағымдану' },
  'Get help with this event': { ru: 'Получить помощь по этому событию', kk: 'Осы іс-шара бойынша көмек алу' },
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
  'Seat selection is not available on the website yet. Choose an event without assigned seating to buy tickets.': {
    ru: 'Выбор мест на сайте пока недоступен. Чтобы купить билеты, выберите событие без назначенных мест.',
    kk: 'Сайтта орын таңдау әзірге қолжетімсіз. Билет сатып алу үшін орындары бекітілмеген іс-шараны таңдаңыз.',
  },
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
