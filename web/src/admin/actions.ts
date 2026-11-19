import { useState } from 'react'
import { api } from '../api'
import { messageFor } from '../organizer/data'

// Runs an admin action, shows its result, then calls refresh.
export function useAction(refresh: () => void) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  async function run(
    ok: string,
    path: string,
    method: 'POST' | 'PUT' = 'POST',
    body?: unknown,
  ) {
    setBusy(true)
    setMessage(null)
    try {
      await api(path, { method, body })
      setMessage({ text: ok, error: false })
      refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, banner: message }
}


export const qs = (values: Record<string, string>) => {
  const p = new URLSearchParams()
  Object.entries(values).forEach(([k, v]) => v && p.set(k, v))
  return p.size ? `?${p}` : ''
}
