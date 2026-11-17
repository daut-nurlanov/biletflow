import { useEffect, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'
import type { SupportCase, SupportCategory } from '../types'

const categories: { value: SupportCategory; label: string }[] = [
  { value: 'ticket_delivery', label: 'Ticket delivery' },
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'seating', label: 'Seating' },
  { value: 'event_information', label: 'Event information' },
  { value: 'check_in', label: 'Check-in' },
  { value: 'account', label: 'Account' },
  { value: 'technical', label: 'Technical problem' },
]

interface OrderOption {
  id: string
  event_title: string
  created_at: string
  ticket_count: number
}

export default function SupportNewPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedCategory, setCategory] = useState<SupportCategory | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [orders, setOrders] = useState<OrderOption[] | null>(null)
  const [orderId, setOrderId] = useState('')
  const [ordersError, setOrdersError] = useState('')

  const ticketId = searchParams.get('ticket_id') || undefined
  const linkedOrderId = searchParams.get('order_id') || undefined
  const eventId = searchParams.get('event_id') || undefined
  const hasContext = Boolean(ticketId || linkedOrderId || eventId)
  const organizer = user?.role === 'organizer'
  const category =
    selectedCategory ?? (organizer ? 'technical' : 'ticket_delivery')
  const availableCategories = organizer
    ? [
        { value: 'account', label: 'Account' },
        { value: 'activation', label: 'Paid-sales activation' },
        { value: 'payment', label: 'Payment' },
        { value: 'technical', label: 'Technical problem' },
      ]
    : categories

  // no ticket/order/event in the link: let the person pick one of their orders
  useEffect(() => {
    if (!user || hasContext || organizer) return
    const controller = new AbortController()
    api<OrderOption[]>('/api/orders/my-orders', { signal: controller.signal })
      .then(setOrders)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setOrders([])
          setOrdersError(
            err instanceof Error ? err.message : 'Could not load your orders',
          )
        }
      })
    return () => controller.abort()
  }, [user, hasContext, organizer])

  if (loading) return <p>Loading…</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname + location.search }}>
          Sign in
        </Link>{' '}
        to open a support request.
      </p>
    )
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sending) return
    const text = message.trim()
    if (!text) {
      setError('Please describe how we can help.')
      return
    }
    if (!hasContext && !orderId && !organizer) {
      setError('Please choose the order this request is about.')
      return
    }

    setSending(true)
    setError('')
    try {
      const created = await api<SupportCase>('/api/support/cases', {
        method: 'POST',
        body: {
          category,
          message: text,
          ticket_id: ticketId,
          order_id: linkedOrderId ?? (orderId || undefined),
          event_id: eventId,
        },
      })
      navigate(`/support/${created.id}`, { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open the request',
      )
    } finally {
      setSending(false)
    }
  }

  const noOrders =
    !organizer &&
    !hasContext &&
    orders !== null &&
    orders.length === 0 &&
    !ordersError

  return (
    <>
      <h1>New support request</h1>
      {organizer && (
        <p className="muted">
          Contact the platform team about your account, paid-sales activation,
          payments or a technical issue. An order is not required.
        </p>
      )}
      {hasContext && (
        <p className="muted">
          This request will be linked to your ticket, order or event
          automatically.
        </p>
      )}
      {noOrders && (
        <p className="muted">
          You have no orders yet, so there is nothing to ask support about.
        </p>
      )}
      {ordersError && (
        <p className="error" role="alert">
          {ordersError}
        </p>
      )}
      <form className="form wide" onSubmit={submit}>
        {!organizer && !hasContext && !noOrders && (
          <>
            <label htmlFor="support-order">Which order is it about?</label>
            <select
              id="support-order"
              required
              value={orderId}
              disabled={sending || orders === null}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">
                {orders === null ? 'Loading…' : 'Choose an order'}
              </option>
              {orders?.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.event_title} · {formatDate(o.created_at)} ·{' '}
                  {o.ticket_count} ticket{o.ticket_count === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="support-category">Category</label>
        <select
          id="support-category"
          value={category}
          disabled={sending}
          onChange={(e) => setCategory(e.target.value as SupportCategory)}
        >
          {availableCategories.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <label htmlFor="support-message">How can we help?</label>
        <textarea
          id="support-message"
          rows={8}
          required
          maxLength={4000}
          disabled={sending}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="muted support-counter" aria-live="polite">
          {message.length} / 4000
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn" type="submit" disabled={sending || noOrders}>
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </>
  )
}
