import { moment, seatLabel } from './format'
import { Link, useSearchParams } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import type { TicketType } from '../types'
import { useManagedEvent } from './Layout'
import { query, useResource } from './data'
import type { Attendee } from './types'
import { Notice, ResourceState, Status, Table } from './ui'
import { useI18n } from "../i18n"

export default function AttendeesPage() {
  const { t: localize } = useI18n()
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const ticketType = params.get('ticket_type_id') ?? ''
  const resource = useResource<Attendee[]>(
    query(`/api/events/${event.id}/attendees`, {
      q,
      status,
      ticket_type_id: ticketType,
    }),
  )
  const types = useResource<TicketType[]>(
    `/api/events/${event.id}/ticket-types`,
  )
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    for (const name of ['q', 'status', 'ticket_type_id']) {
      const value = String(form.get(name) ?? '').trim()
      if (value) next.set(name, value)
    }
    setParams(next)
  }
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>{localize("Attendees")}</h2>
          <p className="muted">
            {localize("Each row represents one ticket. The email belongs to the order buyer.")}
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          {localize("Refresh")}
        </button>
      </div>
      <AttendeeFilters
        key={params.toString()}
        q={q}
        status={status}
        ticketType={ticketType}
        types={types.data}
        onSubmit={filter}
        onReset={() => setParams({})}
      />
      {types.error && (
        <Notice error>
          <p>{localize("Could not load ticket types:")} {types.error}</p>
          <button className="btn secondary" onClick={types.refresh}>
            {localize("Retry")}
          </button>
        </Notice>
      )}
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data && (
        <>
          <p className="muted" role="status">
            {localize("Tickets found:")} {resource.data.length}
          </p>
          {resource.data.length === 0 ? (
            <Notice>{localize("No attendees found. Try changing the filters.")}</Notice>
          ) : (
            <Table
              caption={localize("Event attendees")}
              headings={[
                'Attendee / buyer',
                'Ticket',
                'Seat',
                'Status',
                'Check-in (Almaty)',
                'Order',
              ]}
            >
              {resource.data.map((attendee) => (
                <tr key={attendee.ticket_id}>
                  <td>
                    <strong>{attendee.attendee_name}</strong>
                    <span className="org-subtext">{attendee.email}</span>
                  </td>
                  <td>
                    {attendee.ticket_type}
                    <span className="org-subtext org-id">
                      {attendee.ticket_id}
                    </span>
                  </td>
                  <td>{seatLabel(attendee)}</td>
                  <td>
                    <Status value={attendee.status} />
                  </td>
                  <td>
                    {attendee.checked_in_at
                      ? moment(attendee.checked_in_at)
                      : '—'}
                  </td>
                  <td>
                    <Link
                      to={`/organizer/events/${event.id}/orders/${attendee.order_id}`}
                    >
                      {localize("View order")}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  )
}

function AttendeeFilters({
  q,
  status,
  ticketType,
  types,
  onSubmit,
  onReset,
}: {
  q: string
  status: string
  ticketType: string
  types?: TicketType[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onReset: () => void
}) {
  const { t: localize } = useI18n()
  const [values, setValues] = useState({ q, status, ticketType })
  return (
    <form className="org-filters" onSubmit={onSubmit}>
      <label className="org-field">
        {localize("Name or email")}
        <input
          name="q"
          type="search"
          value={values.q}
          onChange={(e) => setValues({ ...values, q: e.target.value })}
          maxLength={254}
          placeholder={localize("For example, Dana")}
        />
      </label>
      <label className="org-field">
        {localize("Ticket status")}
        <select
          name="status"
          value={values.status}
          onChange={(e) => setValues({ ...values, status: e.target.value })}
        >
          <option value="">{localize("All statuses")}</option>
          <option value="valid">{localize("Valid")}</option>
          <option value="checked_in">{localize("Checked in")}</option>
          <option value="refunded">{localize("Refunded")}</option>
          <option value="cancelled">{localize("Cancelled")}</option>
        </select>
      </label>
      <label className="org-field">
        {localize("Ticket type")}
        <select
          name="ticket_type_id"
          value={values.ticketType}
          onChange={(e) => setValues({ ...values, ticketType: e.target.value })}
        >
          <option value="">{localize("All types")}</option>
          {types?.map((type) => (
            <option value={type.id} key={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" type="submit">
        {localize("Apply")}
      </button>
      <button className="btn secondary" type="button" onClick={onReset}>
        {localize("Reset")}
      </button>
    </form>
  )
}
