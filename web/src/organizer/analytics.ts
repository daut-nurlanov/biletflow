export function dateRangeError(from: string, to: string): string {
  for (const value of [from, to]) {
    if (!value) continue
    const parsed = new Date(`${value}T00:00:00Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      return 'Enter valid dates in YYYY-MM-DD format.'
    }
  }
  return from && to && from > to
    ? 'The start date must not be after the end date.'
    : ''
}

export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Almaty',
    dateStyle: 'medium',
  }).format(new Date(`${day}T00:00:00Z`))
}
