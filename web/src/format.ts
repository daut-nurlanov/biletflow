export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Almaty',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

export const formatPrice = (value: string | number) => {
  const n = Number(value)
  return n === 0 ? 'Free' : `${n.toLocaleString('en-GB')} ₸`
}
