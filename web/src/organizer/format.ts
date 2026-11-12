export const phaseLabels: Record<string, string> = {
  draft: 'Черновики',
  upcoming: 'Предстоящие',
  active: 'Активные',
  completed: 'Завершённые',
  cancelled: 'Отменённые',
  suspended: 'Приостановленные',
}
export const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  upcoming: 'Предстоящее',
  active: 'Активно',
  completed: 'Завершено',
  cancelled: 'Отменено',
  suspended: 'Приостановлено',
  paid: 'Подтверждён',
  failed: 'Ошибка оплаты',
  refunded: 'Возвращён',
  valid: 'Действителен',
  checked_in: 'Прошёл',
  pending: 'Ожидает оплаты',
}
export const money = (value: number | string) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 2,
  }).format(Number(value))
export const moment = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
export function seatLabel(seat: {
  section: string | null
  row_label: string | null
  seat_number: string | null
}) {
  return seat.section
    ? `${seat.section} · ряд ${seat.row_label ?? '—'} · место ${seat.seat_number ?? '—'}`
    : 'Без места'
}
