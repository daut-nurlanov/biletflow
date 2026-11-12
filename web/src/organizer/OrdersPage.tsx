import { moment, money, seatLabel } from './format'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useManagedEvent } from './Layout'
import { messageFor, query, useResource } from './data'
import type { Order, OrderDetail } from './types'
import { Notice, ResourceState, Status, Table } from './ui'

export function OrdersPage() {
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const resource = useResource<Order[]>(
    query(`/api/events/${event.id}/orders`, { status }),
  )
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>Orders</h2>
          <p className="muted">
            Payments and refunds are simulated. No real money is charged.
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          Refresh
        </button>
      </div>
      <label className="org-field org-filter">
        Order status
        <select
          value={status}
          onChange={(e) =>
            setParams(e.target.value ? { status: e.target.value } : {})
          }
        >
          <option value="">All statuses</option>
          <option value="paid">Confirmed</option>
          <option value="failed">Payment failed</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending payment</option>
        </select>
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data &&
        (resource.data.length === 0 ? (
          <Notice>No orders match these filters.</Notice>
        ) : (
          <Table
            caption="Event orders"
            headings={[
              'Order / date (Almaty)',
              'Buyer',
              'Tickets',
              'Amount',
              'Status',
              'Actions',
            ]}
          >
            {resource.data.map((order) => (
              <tr key={order.id}>
                <td>
                  <span className="org-id">{order.id}</span>
                  <span className="org-subtext">
                    {moment(order.created_at)}
                  </span>
                </td>
                <td>
                  {order.full_name}
                  <span className="org-subtext">{order.email}</span>
                </td>
                <td>{order.ticket_count}</td>
                <td>{money(order.total_amount)}</td>
                <td>
                  <Status value={order.status} />
                </td>
                <td>
                  <Link to={`/organizer/events/${event.id}/orders/${order.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        ))}
    </>
  )
}

export function OrderPage() {
  const { orderId } = useParams()
  return <OrderView key={orderId} orderId={orderId ?? ''} />
}

function OrderView({ orderId }: { orderId: string }) {
  const event = useManagedEvent()
  const resource = useResource<OrderDetail>(
    `/api/orders/${encodeURIComponent(orderId)}`,
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const submitting = useRef(false)
  const order = resource.data
  const hasUsedTickets = order?.tickets.some(
    (ticket) => ticket.status === 'checked_in',
  )
  const paid = Number(order?.total_amount) > 0
  const canChange =
    order?.status === 'paid' && !hasUsedTickets && order.tickets.length > 0

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!order || !canChange || submitting.current) return
    const reason = String(
      new FormData(e.currentTarget).get('reason') ?? '',
    ).trim()
    submitting.current = true
    setBusy(true)
    setActionError('')
    setSuccess('')
    try {
      await api(
        `/api/orders/${encodeURIComponent(orderId)}/${paid ? 'refund' : 'cancel'}`,
        {
          method: 'POST',
          ...(paid ? { body: { reason: reason || null } } : {}),
        },
      )
      setConfirming(false)
      setSuccess(
        paid
          ? 'Simulated refund completed. The tickets are no longer valid.'
          : 'Free registration cancelled. The tickets are no longer valid.',
      )
      resource.refresh()
    } catch (error) {
      setActionError(messageFor(error))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <Link to={`/organizer/events/${event.id}/orders`}>← All orders</Link>
      <h2>
        Order <span className="org-id">{orderId}</span>
      </h2>
      {success && <Notice>{success}</Notice>}
      <ResourceState {...resource} retry={resource.refresh} />
      {order &&
        (order.event_id !== event.id ? (
          <Notice error>This order belongs to a different event.</Notice>
        ) : (
          <>
            <div className="org-panel">
              <div className="org-heading">
                <div>
                  <Status value={order.status} />
                  <p>{moment(order.created_at)} · Almaty time</p>
                </div>
                <strong className="org-order-amount">
                  {money(order.total_amount)}
                </strong>
              </div>
              <p>Promo code: {order.promo_code_applied || 'not applied'}</p>
              <p className="muted">
                Demo order. All financial transactions are simulated.
              </p>
            </div>
            <h3>Order tickets</h3>
            {order.tickets.length === 0 ? (
              <Notice>No tickets have been issued.</Notice>
            ) : (
              <Table
                caption="Order tickets"
                headings={['Attendee', 'Ticket type', 'Seat', 'Status']}
              >
                {order.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      {ticket.attendee_name}
                      <span className="org-subtext org-id">{ticket.id}</span>
                    </td>
                    <td>{ticket.ticket_type_name}</td>
                    <td>{seatLabel(ticket)}</td>
                    <td>
                      <Status value={ticket.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            {hasUsedTickets && (
              <Notice>
                Tickets in this order have already been used. Refunds and
                cancellations are unavailable.
              </Notice>
            )}
            {canChange && !confirming && (
              <div className="org-action">
                <button
                  className="btn org-danger"
                  onClick={() => {
                    setConfirming(true)
                    setActionError('')
                  }}
                >
                  {paid ? 'Refund payment…' : 'Cancel registration…'}
                </button>
              </div>
            )}
            {canChange && confirming && (
              <section
                className="org-panel org-confirm"
                aria-labelledby="confirm-title"
              >
                <h3 id="confirm-title">
                  {paid
                    ? 'Confirm full refund'
                    : 'Confirm registration cancellation'}
                </h3>
                <p>
                  Order <span className="org-id">{order.id}</span> ·{' '}
                  {order.tickets.length} tickets · {money(order.total_amount)}.
                </p>
                <p>
                  All tickets in this order will become invalid and their
                  inventory will be released for sale.{' '}
                  {paid &&
                    'This refund is simulated. No real money is transferred.'}
                </p>
                <form onSubmit={submit}>
                  {paid && (
                    <label className="org-field">
                      Refund reason (optional)
                      <textarea
                        autoFocus
                        name="reason"
                        rows={3}
                        maxLength={1000}
                        disabled={busy}
                      />
                    </label>
                  )}
                  {actionError && (
                    <Notice error>
                      {actionError}
                      <p>
                        If the response was lost, refresh the order and check
                        its status before trying again.
                      </p>
                    </Notice>
                  )}
                  <div className="org-actions">
                    <button
                      className="btn org-danger"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? 'Processing…'
                        : paid
                          ? 'Confirm refund'
                          : 'Confirm cancellation'}
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Back
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(false)
                        resource.refresh()
                      }}
                    >
                      Refresh status
                    </button>
                  </div>
                </form>
              </section>
            )}
            {order.refunds.length > 0 && (
              <section className="org-panel">
                <h3>Refund history</h3>
                {order.refunds.map((refund) => (
                  <div key={refund.id}>
                    <p>
                      {money(refund.amount)} · {moment(refund.created_at)}
                    </p>
                    <p>{refund.reason || 'No reason provided'}</p>
                  </div>
                ))}
              </section>
            )}
          </>
        ))}
    </>
  )
}
