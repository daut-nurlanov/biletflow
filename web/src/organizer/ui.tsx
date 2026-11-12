import type { ReactNode } from 'react'

import { statusLabels } from './format'

export function Status({ value }: { value: string }) {
  return (
    <span className={`org-badge org-badge-${value}`}>
      {statusLabels[value] ?? value}
    </span>
  )
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  return (
    <div
      className={`org-notice${error ? ' org-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean
  error?: string
  retry: () => void
}) {
  if (loading) return <Notice>Loading data…</Notice>
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <button className="btn secondary" onClick={retry}>
          Retry
        </button>
      </Notice>
    )
  return null
}
export function Stat({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="org-stat">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}
export function Table({
  caption,
  headings,
  children,
}: {
  caption: string
  headings: string[]
  children: ReactNode
}) {
  return (
    <div
      className="org-table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table>
        <caption className="org-sr-only">{caption}</caption>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th scope="col" key={heading}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
