import { useEffect, useRef, useState, type FormEvent } from 'react'
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
import { useI18n } from "../i18n"

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
  const { t: localize } = useI18n()
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
  const inFlight = useRef(false)
  const draftAttempt = useRef<{ input: string; key: string } | null>(null)

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

  if (loading) return <p>{localize("Loading…")}</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname + location.search }}>
          {localize("Sign in")}
        </Link>{' '}
        {localize("to open a support request.")}
      </p>
    )
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current || !user) return
    const text = message.trim()
    if (!text) {
      setError('Please describe how we can help.')
      return
    }
    if (!hasContext && !orderId && !organizer) {
      setError('Please choose the order this request is about.')
      return
    }

    inFlight.current = true
    setSending(true)
    setError('')
    try {
      const body = {
          category,
          message: text,
          ticket_id: ticketId,
          order_id: linkedOrderId ?? (orderId || undefined),
          event_id: eventId,
      }
      const input = JSON.stringify([user.id, body])
      if (draftAttempt.current?.input !== input) {
        draftAttempt.current = { input, key: crypto.randomUUID() }
      }
      const created = await api<SupportCase>('/api/support/cases', {
        method: 'POST', body, headers: { 'Idempotency-Key': draftAttempt.current.key },
      })
      draftAttempt.current = null
      navigate(`/support/${created.id}`, { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open the request',
      )
    } finally {
      inFlight.current = false
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
      <h1>{localize("New support request")}</h1>
      {organizer && (
        <p className="muted">
          {localize("Contact the platform team about your account, paid-sales activation, payments or a technical issue. An order is not required.")}
        </p>
      )}
      {hasContext && (
        <p className="muted">
          {localize("This request will be linked to your ticket, order or event automatically.")}
        </p>
      )}
      {noOrders && (
        <p className="muted">
          {localize("You have no orders yet, so there is nothing to ask support about.")}
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
            <label htmlFor="support-order">{localize("Which order is it about?")}</label>
            <select
              id="support-order"
              required
              value={orderId}
              disabled={sending || orders === null}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">
                {orders === null ? localize("Loading…") : localize("Choose an order")}
              </option>
              {orders?.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.event_title} · {formatDate(o.created_at)} ·{' '}
                  {localize('{count} ticket(s)', { count: o.ticket_count })}
                </option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="support-category">{localize("Category")}</label>
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

        <label htmlFor="support-message">{localize("How can we help?")}</label>
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
          {sending ? localize("Sending…") : localize("Send request")}
        </button>
      </form>
    </>
  )
}
