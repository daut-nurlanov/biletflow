export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Almaty',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

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
  return ticketStatusLabels[value] ??
    (readable ? readable[0].toUpperCase() + readable.slice(1) : '')
}
