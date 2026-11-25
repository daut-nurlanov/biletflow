import type { ReactNode } from 'react'
import { Skeleton } from '../components/Surface'

import { statusLabels } from './format'
import { useI18n } from "../i18n"

export function Status({ value }: { value: string }) {
  const { t } = useI18n()
  return (
    <span className={`org-badge org-badge-${value}`}>
      {t(statusLabels[value] ?? value)}
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
  const { t } = useI18n()
  return (
    <div
      className={`org-notice${error ? ' org-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {typeof children === 'string' ? t(children) : children}
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
  const { t: localize } = useI18n()
  if (loading) return <Skeleton label={localize("Loading data…")} />
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <button className="btn secondary" onClick={retry}>
          {localize("Retry")}
        </button>
      </Notice>
    )
  return null
}
export function Stat({ title, value }: { title: string; value: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="org-stat">
      <span>{t(title)}</span>
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
  const { t } = useI18n()
  return (
    <div
      className="org-table-scroll"
      role="region"
      aria-label={t(caption)}
      tabIndex={0}
    >
      <table>
        <caption className="org-sr-only">{t(caption)}</caption>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th scope="col" key={heading}>
                {t(heading)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
