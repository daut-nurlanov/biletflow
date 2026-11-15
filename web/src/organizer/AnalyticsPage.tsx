import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { TicketType } from '../types'
import { useManagedEvent } from './Layout'
import { query, useResource } from './data'
import { dateRangeError, dayLabel } from './analytics'
import type { Analytics } from './types'
import { money, moment } from './format'
import { Notice, ResourceState, Stat, Table } from './ui'
import SalesChart from './SalesChart'

const payoutLabels: Record<string, string> = {
  not_started: 'Not started',
  pending: 'Pending',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
}

export default function AnalyticsPage() {
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const from = params.get('date_from') ?? ''
  const to = params.get('date_to') ?? ''
  const ticketType = params.get('ticket_type_id') ?? ''
  const invalid = dateRangeError(from, to)
  const resource = useResource<Analytics>(
    invalid
      ? null
      : query(`/api/events/${event.id}/analytics`, {
          date_from: from,
          date_to: to,
          ticket_type_id: ticketType,
        }),
  )
  const types = useResource<TicketType[]>(
    `/api/events/${event.id}/ticket-types`,
  )
  const data = resource.data
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>Analytics</h2>
          <p className="muted">
            Sales and attendance from BiletFlow records. All financial
            transactions are simulated.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={Boolean(invalid)}
          onClick={resource.refresh}
        >
          Refresh analytics
        </button>
      </div>
      <AnalyticsFilters
        key={params.toString()}
        from={from}
        to={to}
        ticketType={ticketType}
        types={types.data}
        apply={setParams}
      />
      {invalid && <Notice error>{invalid}</Notice>}
      {types.error && (
        <Notice error>
          <p>Could not load ticket types: {types.error}</p>
          <button className="btn secondary" onClick={types.refresh}>
            Retry ticket types
          </button>
        </Notice>
      )}
      <ResourceState {...resource} retry={resource.refresh} />
      {data && (
        <>
          <p className="muted" role="status">
            Snapshot: {moment(data.generated_at)} · Almaty time. Purchase dates:{' '}
            {from || to
              ? `${from ? dayLabel(from) : 'beginning'} — ${to ? dayLabel(to) : 'no end date'} (inclusive)`
              : 'all dates'}
            . Ticket type:{' '}
            {ticketType
              ? (types.data?.find((type) => type.id === ticketType)?.name ??
                'selected type')
              : 'all types'}
            .
          </p>
          <section aria-labelledby="inventory-title">
            <h3 id="inventory-title">Current inventory</h3>
            <p className="muted">
              Current figures for the selected ticket type, across all purchase
              dates. Remaining inventory includes temporarily held seats. Seat
              holds cover the whole event.
            </p>
            <div className="org-stats">
              <Stat
                title="Total ticket inventory"
                value={data.inventory.total}
              />
              <Stat
                title="Valid and checked-in tickets"
                value={data.inventory.sold}
              />
              <Stat
                title="Remaining inventory"
                value={data.inventory.remaining}
              />
              <Stat title="Sold" value={`${data.inventory.percent_sold}%`} />
              <Stat
                title="Active seat holds (whole event)"
                value={data.inventory.reserved}
              />
            </div>
          </section>
          <section aria-labelledby="revenue-title">
            <h3 id="revenue-title">Revenue for selected purchases</h3>
            <p className="muted">
              Orders are selected by purchase date, including the full end date
              in Almaty time. Refunds are attributed to the original purchase
              date.
            </p>
            <div className="org-stats org-money-stats">
              <Stat
                title="Gross sales before discounts"
                value={money(data.money.gross_sales)}
              />
              <Stat title="Discounts" value={money(data.money.discounts)} />
              <Stat title="Refunds" value={money(data.money.refunds)} />
              <Stat
                title="Revenue after discounts and refunds"
                value={money(data.money.net_revenue)}
              />
              <Stat
                title="Processing fees (simulated)"
                value={money(data.money.processing_fee_simulated)}
              />
              <Stat
                title="Estimated payout (simulated)"
                value={money(data.money.estimated_payout)}
              />
            </div>
            <p className="muted">
              Revenue = gross sales − discounts − refunds. Estimated payout =
              revenue − processing fees. Event payout status:{' '}
              {payoutLabels[data.money.payout_status] ??
                data.money.payout_status}{' '}
              (whole event, simulated).
            </p>
          </section>
          <section aria-labelledby="attendance-title">
            <h3 id="attendance-title">Attendance for selected purchases</h3>
            <p className="muted">
              Current ticket status for orders in the selected period. Refunded
              and cancelled tickets are excluded from registered attendance.
            </p>
            <div className="org-stats">
              <Stat
                title="Registered tickets"
                value={data.attendance.registered}
              />
              <Stat title="Checked in" value={data.attendance.checked_in} />
              <Stat title="Not checked in" value={data.attendance.absent} />
              <Stat
                title="Check-in rate"
                value={`${data.attendance.percent_checked_in}%`}
              />
              <Stat
                title="Refunded tickets"
                value={data.ticket_counts.refunded}
              />
            </div>
          </section>
          <section className="org-panel" aria-labelledby="sales-title">
            <h3 id="sales-title">Sales over time</h3>
            <SalesChart days={data.sales_over_time} />
            {data.sales_over_time.length > 0 && (
              <Table
                caption="Daily sales"
                headings={[
                  'Purchase date (Almaty)',
                  'Confirmed orders',
                  'Tickets',
                  'Revenue (KZT)',
                ]}
              >
                {data.sales_over_time.map((day) => (
                  <tr key={day.day}>
                    <td>{dayLabel(day.day)}</td>
                    <td>{day.orders}</td>
                    <td>{day.tickets}</td>
                    <td>{money(day.revenue)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
          <section aria-labelledby="types-title">
            <h3 id="types-title">Sales by ticket type</h3>
            <p className="muted">
              Sold and refunded counts use the selected purchase dates.
              Inventory and list prices are current; list-price value is not
              actual revenue.
            </p>
            {data.by_ticket_type.length === 0 ? (
              <Notice>No ticket types to show.</Notice>
            ) : (
              <Table
                caption="Sales by ticket type"
                headings={[
                  'Ticket type',
                  'Valid tickets',
                  'Refunded tickets',
                  'Current inventory remaining',
                  'Current list price',
                  'Current list-price value of valid tickets',
                ]}
              >
                {data.by_ticket_type.map((type) => (
                  <tr key={type.id}>
                    <td>{type.name}</td>
                    <td>{type.sold}</td>
                    <td>{type.refunded}</td>
                    <td>{type.remaining}</td>
                    <td>{money(type.price)}</td>
                    <td>{money(type.revenue_at_list_price)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
          <section aria-labelledby="campaigns-title">
            <h3 id="campaigns-title">Campaign performance</h3>
            <p className="muted">
              All sales columns use the same purchase-date and ticket-type
              filters. Active redemptions exclude refunded or cancelled orders.
              Quota usage covers all dates and ticket types.
            </p>
            {data.campaigns.length === 0 ? (
              <Notice>No campaigns for this event yet.</Notice>
            ) : (
              <Table
                caption="Campaign performance"
                headings={[
                  'Campaign',
                  'Successful orders',
                  'Active redemptions',
                  'Valid tickets',
                  'Gross sales',
                  'Discounts',
                  'Refunds',
                  'Net revenue',
                  'Quota used (all dates)',
                ]}
              >
                {data.campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <strong>{campaign.code}</strong>
                      <span className="org-subtext">
                        {campaign.is_active ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {campaign.orders}
                      <span className="org-subtext">
                        {campaign.refunded_orders} refunded
                      </span>
                    </td>
                    <td>{campaign.redemptions}</td>
                    <td>{campaign.tickets}</td>
                    <td>{money(campaign.gross_sales)}</td>
                    <td>{money(campaign.discounts)}</td>
                    <td>{money(campaign.refunds)}</td>
                    <td>{money(campaign.net_revenue)}</td>
                    <td>
                      {campaign.active_redemptions_all_dates} /{' '}
                      {campaign.max_redemptions}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </>
      )}
    </>
  )
}

function AnalyticsFilters({
  from,
  to,
  ticketType,
  types,
  apply,
}: {
  from: string
  to: string
  ticketType: string
  types?: TicketType[]
  apply: (params: URLSearchParams) => void
}) {
  const [values, setValues] = useState({ from, to, ticketType })
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = dateRangeError(values.from, values.to)
    setError(invalid)
    if (invalid) return
    const params = new URLSearchParams()
    if (values.from) params.set('date_from', values.from)
    if (values.to) params.set('date_to', values.to)
    if (values.ticketType) params.set('ticket_type_id', values.ticketType)
    apply(params)
  }
  return (
    <>
      <form className="org-filters" onSubmit={submit}>
        <label className="org-field">
          Purchase date from
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
          Purchase date to
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
          Ticket type
          <select
            name="ticket_type_id"
            value={values.ticketType}
            onChange={(event) =>
              setValues({ ...values, ticketType: event.target.value })
            }
          >
            <option value="">All types</option>
            {values.ticketType &&
              !types?.some((type) => type.id === values.ticketType) && (
                <option value={values.ticketType}>Selected type</option>
              )}
            {types?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
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
