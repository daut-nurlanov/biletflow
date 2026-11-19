import type { ReactNode } from 'react'
import { Notice } from '../organizer/ui'

export function Search({
  q,
  setQ,
  children,
  label = 'Search',
}: {
  q: string
  setQ: (v: string) => void
  children?: ReactNode
  label?: string
}) {
  return (
    <div className="org-filters">
      <label className="org-field">
        {label}
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {children}
    </div>
  )
}


export function Banner({
  message,
}: {
  message: { text: string; error: boolean } | null
}) {
  return message ? <Notice error={message.error}>{message.text}</Notice> : null
}
