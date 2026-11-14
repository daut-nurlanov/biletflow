import { moment, money, phaseLabels } from './format'
import { Link, useSearchParams } from 'react-router-dom'
import { useResource } from './data'
import type { ManagedEvent } from './types'
import { Notice, ResourceState, Stat, Status } from './ui'
import { useManagedEvent } from './Layout'

export function OrganizerEventsPage() {
  const resource = useResource<ManagedEvent[]>('/api/organizer/events')
  const [params, setParams] = useSearchParams()
  const phase = params.get('phase') ?? ''
  const events = resource.data?.filter(
    (event) => !phase || event.phase === phase,
  )
  return (
    <>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Organizer dashboard</p>
          <h1>My events</h1>
          <p className="muted">Sales, attendees and orders for your events.</p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          Refresh
        </button>
      </div>
      <label className="org-field org-filter">
        Event phase
        <select
          value={phase}
          onChange={(e) =>
            setParams(e.target.value ? { phase: e.target.value } : {})
          }
        >
          <option value="">All events</option>
          {Object.entries(phaseLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {events?.length === 0 && (
        <Notice>No events to show. Try selecting a different phase.</Notice>
      )}
      <div className="org-event-grid">
        {events?.map((event) => (
          <article className="org-panel" key={event.id}>
            <Status value={event.phase} />
            <h2>
              <Link to={`/organizer/events/${event.id}`}>{event.title}</Link>
            </h2>
            <p>{moment(event.start_time)}</p>
            <p className="muted">{event.venue_name}</p>
            <dl className="org-facts">
              <div>
                <dt>Tickets sold</dt>
                <dd>
                  {event.tickets_sold} / {event.tickets_total}
                </dd>
              </div>
              <div>
                <dt>Checked in</dt>
                <dd>{event.tickets_checked_in}</dd>
              </div>
              <div>
                <dt>Revenue after discounts and refunds</dt>
                <dd>{money(event.net_revenue)}</dd>
              </div>
            </dl>
            <Link className="btn" to={`/organizer/events/${event.id}`}>
              Manage
            </Link>
          </article>
        ))}
      </div>
    </>
  )
}
export function EventOverviewPage() {
  const event = useManagedEvent()
  const base = `/organizer/events/${event.id}`
  return (
    <>
      <div className="org-stats">
        <Stat title="Total ticket inventory" value={event.tickets_total} />
        <Stat title="Valid and checked-in tickets" value={event.tickets_sold} />
        <Stat title="Checked in" value={event.tickets_checked_in} />
        <Stat
          title="Revenue after discounts and refunds"
          value={money(event.net_revenue)}
        />
      </div>
      <p className="muted">
        Demo payments. Revenue is shown before processing fees. Refresh the page
        to see the latest figures.
      </p>
      <div className="org-event-grid">
        <article className="org-panel">
          <h2>Attendees</h2>
          <p>Find a ticket by name or email and check its admission status.</p>
          <Link className="btn" to={`${base}/attendees`}>
            View attendees
          </Link>
        </article>
        <article className="org-panel">
          <h2>Orders</h2>
          <p>
            Review order tickets, issue a refund or cancel a free registration.
          </p>
          <Link className="btn" to={`${base}/orders`}>
            View orders
          </Link>
        </article>
      </div>
      <section className="org-panel">
        <h2>Event information</h2>
        <p>
          Venue: {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''}
        </p>
        <p>Venue capacity: {event.capacity}</p>
        <p>
          Paid sales:{' '}
          {event.is_paid_sales_active ? 'activated' : 'not activated'}
        </p>
        <p>Refund policy: {event.refund_policy || 'not specified'}</p>
        <Link to={`/events/${event.id}`}>View event page →</Link>
      </section>
    </>
  )
}
