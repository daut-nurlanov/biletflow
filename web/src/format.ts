import { currentLang, dateLocale, translate } from './i18n'

const kkMonths = [
  'қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым',
  'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан',
]

// Event times are always shown in Almaty time. Kazakh month names are written
// out here because not every browser ships Kazakh date data.
export const formatDate = (iso: string) => {
  const date = new Date(iso)
  if (currentLang() === 'kk') {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Almaty', day: 'numeric', month: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(date).map((p) => [p.type, p.value]),
    )
    return `${parts.year} жылғы ${Number(parts.day)} ${kkMonths[Number(parts.month) - 1]}, ${parts.hour}:${parts.minute}`
  }
  return date.toLocaleString(dateLocale(), {
    timeZone: 'Asia/Almaty',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatPrice = (value: string | number) => {
  const n = Number(value)
  if (n === 0) return 'Free'
  const whole = Number.isInteger(n)
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })} KZT`
}

const ticketStatusLabels: Record<string, string> = {
  valid: 'Valid',
  checked_in: 'Checked in',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export const formatStatus = (value: string) => {
  const readable = value.replaceAll('_', ' ')
  const english = ticketStatusLabels[value] ??
    (readable ? readable[0].toUpperCase() + readable.slice(1) : '')
  return translate(english, currentLang())
}
