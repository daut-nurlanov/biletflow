import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useManagedEvent } from './Layout'
import { dateRangeError } from './analytics'
import { query, useResource } from './data'
import { actionLabel, historyActions, historyMoment } from './history'
import type { HistoryEntry } from './types'
import { Notice, ResourceState } from './ui'

const PAGE_SIZE = 50

export default function HistoryPage() {
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const from = params.get('date_from') ?? ''
  const to = params.get('date_to') ?? ''
  const action = params.get('action') ?? ''
  const filterKey = JSON.stringify([event.id, from, to, action])
  return (
    <HistoryView
      key={filterKey}
      eventId={event.id}
      from={from}
      to={to}
      action={action}
      apply={setParams}
    />
  )
}

function HistoryView({
  eventId,
  from,
  to,
  action,
  apply,
}: {
  eventId: string
  from: string
  to: string
  action: string
  apply: (params: URLSearchParams) => void
}) {
  const [before, setBefore] = useState<string | null>(null)
  const [olderPages, setOlderPages] = useState<HistoryEntry[]>([])
  const invalid = dateRangeError(from, to)
  const resource = useResource<HistoryEntry[]>(
    invalid
      ? null
      : query(`/api/events/${eventId}/timeline`, {
          date_from: from,
          date_to: to,
          action,
          before,
          limit: String(PAGE_SIZE),
        }),
  )
  const entries = [...olderPages, ...(resource.data ?? [])]
  const actions = [
    ...new Set([
      ...Object.keys(historyActions),
      action,
      ...entries.map((entry) => entry.action),
    ]),
  ].filter(Boolean)
  const hasMore = resource.data?.length === PAGE_SIZE
  function refresh() {
    setBefore(null)
    setOlderPages([])
    resource.refresh()
  }
  function loadOlder() {
    const last = entries.at(-1)
    if (!last || !hasMore || resource.loading) return
    setOlderPages(entries)
    setBefore(`${last.timestamp}|${last.id}`)
  }
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>History</h2>
          <p className="muted">
            Read-only activity for this event, newest first. Times use Almaty
            time.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={Boolean(invalid)}
          onClick={refresh}
        >
          Refresh history
        </button>
      </div>
      <HistoryFilters
        from={from}
        to={to}
        action={action}
        actions={actions}
        apply={apply}
      />
      {invalid && <Notice error>{invalid}</Notice>}
      {entries.length > 0 && (
        <>
          <p className="muted" role="status">
            {entries.length} activity records loaded.{' '}
            {hasMore && 'Older records are available below.'}
          </p>
          <ol className="org-history" aria-label="Event activity history">
            {entries.map((entry) => (
              <li key={entry.id} className="org-panel org-history-entry">
                <div className="org-heading">
                  <h3>{actionLabel(entry.action)}</h3>
                  <time dateTime={entry.timestamp}>
                    {historyMoment(entry.timestamp)}
                  </time>
                </div>
                <p>
                  <strong>{entry.actor ?? 'System or unavailable user'}</strong>
                </p>
                <p className="org-history-details">
                  {entry.details || 'No additional description recorded.'}
                </p>
                <p className="muted">
                  Affected record:{' '}
                  <AffectedRecord entry={entry} eventId={eventId} />
                </p>
                <details className="org-history-record">
                  <summary>Record identifiers</summary>
                  <dl>
                    <div>
                      <dt>Activity</dt>
                      <dd className="org-id">{entry.id}</dd>
                    </div>
                    {entry.actor_id && (
                      <div>
                        <dt>Actor</dt>
                        <dd className="org-id">{entry.actor_id}</dd>
                      </div>
                    )}
                    {entry.entity_id && (
                      <div>
                        <dt>Entity</dt>
                        <dd className="org-id">{entry.entity_id}</dd>
                      </div>
                    )}
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data && entries.length === 0 && (
        <Notice>No activity matches these filters.</Notice>
      )}
      {hasMore && (
        <button className="btn" disabled={resource.loading} onClick={loadOlder}>
          Load older activity
        </button>
      )}
      {resource.data && entries.length > 0 && !hasMore && (
        <p className="muted">
          End of activity for these filters. Refresh to check for new records.
        </p>
      )}
      <p className="muted">
        Changing filters or refreshing restarts the list. History records cannot
        be edited or deleted here.
      </p>
    </>
  )
}

function AffectedRecord({
  entry,
  eventId,
}: {
  entry: HistoryEntry
  eventId: string
}) {
  const label = entry.entity_type?.replaceAll('_', ' ') || 'Not specified'
  if (!entry.entity_id) return <span>{label}</span>
  if (entry.entity_type === 'order')
    return (
      <Link
        to={`/organizer/events/${eventId}/orders/${encodeURIComponent(entry.entity_id)}`}
      >
        Order details
      </Link>
    )
  if (entry.entity_type === 'support_case')
    return (
      <Link to={`/support/${encodeURIComponent(entry.entity_id)}`}>
        Support case
      </Link>
    )
  if (entry.entity_type === 'event' && entry.entity_id === eventId)
    return <Link to={`/organizer/events/${eventId}`}>Event overview</Link>
  if (entry.action === 'staff_assigned' || entry.action === 'staff_revoked')
    return <Link to={`/organizer/events/${eventId}/staff`}>Event staff</Link>
  return <span>{label}</span>
}

function HistoryFilters({
  from,
  to,
  action,
  actions,
  apply,
}: {
  from: string
  to: string
  action: string
  actions: string[]
  apply: (params: URLSearchParams) => void
}) {
  const [values, setValues] = useState({ from, to, action })
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = dateRangeError(values.from, values.to)
    setError(invalid)
    if (invalid) return
    const next = new URLSearchParams()
    if (values.from) next.set('date_from', values.from)
    if (values.to) next.set('date_to', values.to)
    if (values.action) next.set('action', values.action)
    apply(next)
  }
  return (
    <>
      <form className="org-filters" onSubmit={submit}>
        <label className="org-field">
          Activity date from
          <input
            type="date"
            name="date_from"
            value={values.from}
            max={values.to || undefined}
            onChange={(event) =>
              setValues({ ...values, from: event.target.value })
            }
          />
        </label>
        <label className="org-field">
          Activity date to
          <input
            type="date"
            name="date_to"
            value={values.to}
            min={values.from || undefined}
            onChange={(event) =>
              setValues({ ...values, to: event.target.value })
            }
          />
        </label>
        <label className="org-field">
          Activity type
          <select
            name="action"
            value={values.action}
            onChange={(event) =>
              setValues({ ...values, action: event.target.value })
            }
          >
            <option value="">All activity</option>
            {[...actions]
              .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)))
              .map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Apply filters
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={() => apply(new URLSearchParams())}
        >
          Reset filters
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
    </>
  )
}
