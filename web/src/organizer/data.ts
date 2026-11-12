import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия истекла. Войдите снова.'
    if (error.status === 403) return 'У вас нет доступа к этим данным.'
    if (error.status === 404)
      return 'Запись не найдена или недоступна вашему аккаунту.'
    const messages: Record<string, string> = {
      'Some tickets were already used at the door, so the order cannot be refunded':
        'По этому заказу уже прошли на мероприятие. Возврат недоступен.',
      'Some tickets were already used at the door':
        'По этому заказу уже прошли на мероприятие. Отмена недоступна.',
      'This is a free registration, use cancel instead of refund':
        'Это бесплатная регистрация. Используйте отмену регистрации.',
      'This order was paid for, ask the organizer for a refund':
        'Заказ оплачен. Используйте возврат оплаты.',
    }
    return messages[error.message] ?? error.message
  }
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.'
}

export function useResource<T>(path: string) {
  const [revision, setRevision] = useState(0)
  const key = `${path}:${revision}`
  const [result, setResult] = useState<{
    key: string
    data?: T
    error?: string
  }>()
  useEffect(() => {
    const controller = new AbortController()
    api<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, error: messageFor(error) })
      },
    )
    return () => controller.abort()
  }, [path, key])
  const current = result?.key === key ? result : undefined
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    refresh: () => setRevision((value) => value + 1),
  }
}

export function query(path: string, values: Record<string, string | null>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return `${path}${params.size ? `?${params}` : ''}`
}
