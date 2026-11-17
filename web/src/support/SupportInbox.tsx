import { useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { formatDate } from '../format'
import { query, useResource } from '../organizer/data'
import type { ManagedEvent } from '../organizer/types'
import type { SupportCase } from '../types'
import { supportLabel, supportStatuses } from './labels'
import './support.css'

export default function SupportInbox({
  organizer = false,
  eventId,
}: {
  organizer?: boolean
  eventId?: string
}) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = {
    status: organizer ? (params.get('status') ?? '') : '',
    escalated: organizer ? (params.get('escalated') ?? '') : '',
    kind: eventId ? 'attendee' : organizer ? (params.get('kind') ?? '') : '',
    event_id: eventId ?? (organizer ? (params.get('event_id') ?? '') : ''),
  }
  const resource = useResource<SupportCase[]>(
    query('/api/support/cases', filters),
  )
  const events = useResource<ManagedEvent[]>(
    organizer && !eventId ? '/api/organizer/events' : null,
  )
  const hasFilters =
    Object.entries(filters).some(
      ([key, value]) =>
        value && key !== 'event_id' && !(eventId && key === 'kind'),
    ) ||
    (!eventId && Boolean(filters.event_id))
  return (
    <section className="support-inbox">
      <div className="support-heading">
        <div>
          {eventId ? <h2>Attendee support</h2> : <h1>Support</h1>}
          {organizer && (
            <p className="muted">
              {eventId
                ? 'Requests from attendees for this event, including completed and cancelled events.'
                : 'Manage attendee requests or review your own requests to the platform team.'}
            </p>
          )}
        </div>
        <div className="support-actions">
          <button className="btn secondary" onClick={resource.refresh}>
            Refresh requests
          </button>
          {!eventId && (
            <Link className="btn" to="/support/new">
              {organizer ? 'Contact platform support' : 'New request'}
            </Link>
          )}
        </div>
      </div>
      {organizer && (
        <InboxFilters
          key={JSON.stringify(filters)}
          filters={filters}
          fixedEvent={Boolean(eventId)}
          events={events.data ?? []}
          apply={setParams}
        />
      )}
      {events.error && (
        <p className="error" role="alert">
          Could not load event choices.{' '}
          <button className="btn secondary" onClick={events.refresh}>
            Retry event choices
          </button>
        </p>
      )}
      {resource.loading && <p role="status">Loading requests…</p>}
      {resource.error && (
        <div className="error" role="alert">
          <p>{resource.error}</p>
          <button className="btn secondary" onClick={resource.refresh}>
            Retry requests
          </button>
        </div>
      )}
      {resource.data?.length === 0 && (
        <p className="muted">
          {hasFilters
            ? 'No support requests match these filters.'
            : eventId
              ? 'No attendee support requests for this event yet.'
              : 'You have no support requests yet.'}
        </p>
      )}
      <div className="grid">
        {resource.data?.map((item) => (
          <Link
            className="card support-case-card"
            to={`/support/${item.id}`}
            state={{ fromSupport: location.pathname + location.search }}
            key={item.id}
          >
            <div className="support-heading">
              <h3>{supportLabel(item.category)}</h3>
              <strong>
                {supportStatuses[item.status] ?? supportLabel(item.status)}
              </strong>
            </div>
            <p>{item.event_title ?? 'General support'}</p>
            {organizer && (
              <p>
                {item.kind === 'organizer'
                  ? 'Your platform request'
                  : `Attendee: ${item.opened_by_name ?? 'Unavailable user'}`}
              </p>
            )}
            {item.escalated && (
              <p className="support-escalated">Escalated to platform support</p>
            )}
            <div className="muted">Updated {formatDate(item.updated_at)}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function InboxFilters({
  filters,
  fixedEvent,
  events,
  apply,
}: {
  filters: {
    status: string
    escalated: string
    kind: string
    event_id: string
  }
  fixedEvent: boolean
  events: ManagedEvent[]
  apply: (params: URLSearchParams) => void
}) {
  const [values, setValues] = useState(filters)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value && !(fixedEvent && (key === 'event_id' || key === 'kind')))
        next.set(key, value)
    }
    apply(next)
  }
  return (
    <form className="support-filters" onSubmit={submit}>
      {!fixedEvent && (
        <label>
          Request type
          <select
            name="kind"
            value={values.kind}
            onChange={(event) =>
              setValues({ ...values, kind: event.target.value })
            }
          >
            <option value="">All requests</option>
            <option value="attendee">Attendee requests</option>
            <option value="organizer">My platform requests</option>
          </select>
        </label>
      )}
      {!fixedEvent && (
        <label>
          Event
          <select
            name="event_id"
            value={values.event_id}
            onChange={(event) =>
              setValues({ ...values, event_id: event.target.value })
            }
          >
            <option value="">All events</option>
            {values.event_id &&
              !events.some((event) => event.id === values.event_id) && (
                <option value={values.event_id}>
                  Selected event unavailable
                </option>
              )}
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Status
        <select
          name="status"
          value={values.status}
          onChange={(event) =>
            setValues({ ...values, status: event.target.value })
          }
        >
          <option value="">All statuses</option>
          {Object.entries(supportStatuses).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Escalation
        <select
          name="escalated"
          value={values.escalated}
          onChange={(event) =>
            setValues({ ...values, escalated: event.target.value })
          }
        >
          <option value="">All requests</option>
          <option value="true">Escalated</option>
          <option value="false">Not escalated</option>
        </select>
      </label>
      <button className="btn" type="submit">
        Apply filters
      </button>
      <button
        className="btn secondary"
        type="button"
        onClick={() => {
          setValues({
            status: '',
            escalated: '',
            kind: fixedEvent ? 'attendee' : '',
            event_id: fixedEvent ? filters.event_id : '',
          })
          apply(new URLSearchParams())
        }}
      >
        Reset filters
      </button>
    </form>
  )
}
