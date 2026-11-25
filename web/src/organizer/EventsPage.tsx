import { moment, money, phaseLabels } from './format'
import { Link, useSearchParams } from 'react-router-dom'
import { useResource } from './data'
import type { ManagedEvent } from './types'
import { Notice, ResourceState, Stat, Status } from './ui'
import { useManagedEvent } from './Layout'
import { useI18n } from "../i18n"

export function OrganizerEventsPage() {
  const { t: localize } = useI18n()
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
          <p className="org-eyebrow">{localize("Organizer dashboard")}</p>
          <h1>{localize("My events")}</h1>
          <p className="muted">{localize("Sales, attendees and orders for your events.")}</p>
        </div>
        <div className="org-actions">
          <Link className="btn" to="/organizer/new">
            {localize("New event")}
          </Link>
          <Link className="btn secondary" to="/organizer/profile">
            {localize("Profile")}
          </Link>
          <button className="btn secondary" onClick={resource.refresh}>
            {localize("Refresh")}
          </button>
        </div>
      </div>
      <label className="org-field org-filter">
        {localize("Event phase")}
        <select
          value={phase}
          onChange={(e) =>
            setParams(e.target.value ? { phase: e.target.value } : {})
          }
        >
          <option value="">{localize("All events")}</option>
          {Object.entries(phaseLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {events?.length === 0 && (
        <Notice>{localize("No events to show. Try selecting a different phase.")}</Notice>
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
                <dt>{localize("Tickets sold")}</dt>
                <dd>
                  {event.tickets_sold} / {event.tickets_total}
                </dd>
              </div>
              <div>
                <dt>{localize("Checked in")}</dt>
                <dd>{event.tickets_checked_in}</dd>
              </div>
              <div>
                <dt>{localize("Revenue after discounts and refunds")}</dt>
                <dd>{money(event.net_revenue)}</dd>
              </div>
            </dl>
            <Link className="btn" to={`/organizer/events/${event.id}`}>
              {localize("Manage")}
            </Link>
          </article>
        ))}
      </div>
    </>
  )
}
export function EventOverviewPage() {
  const { t: localize } = useI18n()
  const event = useManagedEvent()
  const base = `/organizer/events/${event.id}`
  return (
    <>
      <div className="org-stats">
        <Stat title={localize("Total ticket inventory")} value={event.tickets_total} />
        <Stat title={localize("Valid and checked-in tickets")} value={event.tickets_sold} />
        <Stat title={localize("Checked in")} value={event.tickets_checked_in} />
        <Stat
          title={localize("Revenue after discounts and refunds")}
          value={money(event.net_revenue)}
        />
      </div>
      <p className="muted">
        {localize("Demo payments. Revenue is shown before processing fees. Refresh the page to see the latest figures.")}
      </p>
      <div className="org-event-grid">
        <article className="org-panel">
          <h2>{localize("Attendees")}</h2>
          <p>{localize("Find a ticket by name or email and check its admission status.")}</p>
          <Link className="btn" to={`${base}/attendees`}>
            {localize("View attendees")}
          </Link>
        </article>
        <article className="org-panel">
          <h2>{localize("Orders")}</h2>
          <p>
            {localize("Review order tickets, issue a refund or cancel a free registration.")}
          </p>
          <Link className="btn" to={`${base}/orders`}>
            {localize("View orders")}
          </Link>
        </article>
      </div>
      <section className="org-panel">
        <h2>{localize("Event information")}</h2>
        <p>
          {localize("Venue:")} {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''}
        </p>
        <p>{localize("Venue capacity:")} {event.capacity}</p>
        <p>
          {localize("Paid sales:")}{' '}
          {event.is_paid_sales_active ? localize("activated") : localize("not activated")}
        </p>
        <p>{localize("Refund policy:")} {event.refund_policy || 'not specified'}</p>
        <Link to={`/events/${event.id}`}>{localize("View event page →")}</Link>
      </section>
    </>
  )
}
