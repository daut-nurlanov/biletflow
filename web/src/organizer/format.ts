export const phaseLabels: Record<string, string> = {
  draft: 'Drafts',
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
}
export const statusLabels: Record<string, string> = {
  draft: 'Draft',
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
  paid: 'Confirmed',
  failed: 'Payment failed',
  refunded: 'Refunded',
  valid: 'Valid',
  checked_in: 'Checked in',
  pending: 'Pending payment',
}
export const money = (value: number | string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 2,
  }).format(Number(value))
export const moment = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
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
    ? `${seat.section} · row ${seat.row_label ?? '—'} · seat ${seat.seat_number ?? '—'}`
    : 'General admission'
}
