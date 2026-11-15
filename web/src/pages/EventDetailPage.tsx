import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, getToken } from '../api'
import { useAuth } from '../auth'
import { formatDate, formatPrice } from '../format'
import type { EventItem, Quote, TicketType } from '../types'

export default function EventDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const campaignToken = searchParams.get('c')
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [event, setEvent] = useState<EventItem | null>(null)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [error, setError] = useState('')

  const [ticketId, setTicketId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [attendeeName, setAttendeeName] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState('') // the promo code that is applied
  const [promoNote, setPromoNote] = useState('')
  const [quoteResult, setQuoteResult] = useState<{ selection: string; value: Quote } | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteAttempt, setQuoteAttempt] = useState(0)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState('')
  const keyRef = useRef(crypto.randomUUID())
  const purchaseChoice = useRef('')
  const inFlight = useRef(false)

  // load the event and its ticket types
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api<EventItem>(`/api/events/${id}`, { signal: controller.signal }),
      api<TicketType[]>(`/api/events/${id}/ticket-types`, { signal: controller.signal }),
    ])
      .then(([ev, tt]) => {
        setEvent(ev)
        setTickets(tt)
        setError('')
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [id])

    // campaign QR landing: ?c=token fills in the promo code automatically
  useEffect(() => {
    if (!campaignToken) return
    const controller = new AbortController()
    api<Record<string, unknown>>(`/api/campaigns/resolve?token=${encodeURIComponent(campaignToken)}`, { signal: controller.signal })
      .then((data) => {
        const campaignEvent = data.event_id as string | undefined
        if (campaignEvent && campaignEvent !== id) {
          setPromoNote('This promo link belongs to a different event')
          return
        }
        const code = (data.code ?? data.promo_code) as string | undefined
        if (code) {
          setPromoInput(code)
          setPromo(code)
          setPromoNote(`Promo code ${code} applied from your link`)
        }
      })
      .catch((e) => { if (!controller.signal.aborted) setPromoNote(`The promo link did not work: ${e.message}`) })
    return () => controller.abort()
  }, [campaignToken, id])

  const selected = tickets.find((t) => t.id === ticketId && t.event_id === id) ?? null
  const name = attendeeName || user?.full_name || ''
  const selection = JSON.stringify([id, selected?.id, quantity, promo, user?.id])
  const quote = quoteResult?.selection === selection ? quoteResult.value : null

    // recalculate the price whenever the choice changes
  useEffect(() => {
    if (purchaseChoice.current !== selection) {
      purchaseChoice.current = selection
      keyRef.current = crypto.randomUUID()
    }
    if (!selected || !id) return
    const controller = new AbortController()
    let active = true // ignore answers that arrive after a newer request started
    api<Quote>('/api/orders/quote', {
      method: 'POST',
      signal: controller.signal,
      body: { event_id: id, ticket_type_id: selected.id, quantity, promo_code: promo || undefined },
    })
      .then((q) => {
        if (!active) return
        setQuoteResult({ selection, value: q })
        setQuoteError('')
      })
      .catch((e) => {
        if (!active) return
        setQuoteResult(null)
        setQuoteError(e.message)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [id, selected, quantity, promo, selection, quoteAttempt])

  async function buy() {
    if (inFlight.current || !quote || !name.trim()) return
    if (!getToken()) {
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }
    if (!selected || !event || event.id !== id) return
    inFlight.current = true
    setBuying(true)
    setBuyError('')
    try {
      await api('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': keyRef.current },
        body: {
          event_id: event.id,
          ticket_type_id: selected.id,
          attendee_name: name,
          quantity,
          promo_code: promo || undefined,
        },
      })
      navigate('/my-tickets', { state: { justBought: true } })
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : 'Could not complete the purchase')
    } finally {
      inFlight.current = false
      setBuying(false)
    }
  }

  if (error) return <p className="error">{error}</p>
  if (!event || event.id !== id) return <p>Loading…</p>

  const paidBlocked = (t: TicketType) => Number(t.price) > 0 && !event.is_paid_sales_active
  const soldOut = (t: TicketType) => t.quantity_available <= 0
  const maxQty = selected ? Math.min(selected.max_per_order, selected.quantity_available) : 1

  return (
    <>
      <h1>{event.title}</h1>
      <p className="muted">
        {formatDate(event.start_time)} · {event.venue_name}
        {event.venue_address ? `, ${event.venue_address}` : ''}
      </p>
      {event.image_url && <img src={event.image_url} alt="" className="cover" />}
      {event.description && <p>{event.description}</p>}
      {event.refund_policy && <p className="muted">Refund policy: {event.refund_policy}</p>}

      <h2>Tickets</h2>
      <div className="grid">
        {tickets.map((t) => {
          const disabled = buying || soldOut(t) || paidBlocked(t) || event.has_assigned_seating
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              className={`card choice ${ticketId === t.id ? 'selected' : ''}`}
              onClick={() => {
                setTicketId(t.id)
                setQuantity(1)
              }}
            >
              <div className="row">
                <h3>{t.name}</h3>
                <strong>{formatPrice(t.price)}</strong>
              </div>
              {t.description && <div className="muted">{t.description}</div>}
              <div className="muted">
                {soldOut(t) ? 'Sold out' : `${t.quantity_available} left`}
                {paidBlocked(t) ? ' · paid sales not available' : ''}
              </div>
            </button>
          )
        })}
      </div>

      {event.has_assigned_seating && (
        <p className="muted">
          This event uses assigned seating, which is not available yet. To buy a ticket, open Almaty Tech Meetup.
        </p>
      )}

      {selected && !event.has_assigned_seating && (
        <div className="card buy">
          <h2>Checkout</h2>
          <div className="form">
            <label htmlFor="attendee-name" className="muted">Name on the ticket</label>
            <input id="attendee-name" maxLength={120} disabled={buying} value={name} onChange={(e) => setAttendeeName(e.target.value)} />

            <label htmlFor="quantity" className="muted">Quantity (up to {maxQty})</label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={maxQty}
              step={1}
              disabled={buying}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            />

            <label htmlFor="promo" className="muted">Promo code</label>
            <div className="row">
              <input id="promo" disabled={buying} value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} />
              <button
                type="button"
                className="btn secondary"
                disabled={buying}
                onClick={() => {
                  setPromo(promoInput.trim())
                  setPromoNote('')
                }}
              >
                Apply
              </button>
            </div>
            {promoNote && <div className="muted">{promoNote}</div>}
          </div>

          {!quote && !quoteError && <p role="status">Calculating price…</p>}
          {quoteError && <p className="error" role="alert">{quoteError} <button type="button" className="btn secondary" onClick={() => { setQuoteError(''); setQuoteAttempt((attempt) => attempt + 1) }}>Retry quote</button></p>}
          {quote && (
            <div className="totals">
              <div className="row"><span>Subtotal</span><span>{formatPrice(quote.subtotal)}</span></div>
              {Number(quote.discount) > 0 && (
                <div className="row"><span>Discount</span><span>−{formatPrice(quote.discount)}</span></div>
              )}
              <div className="row"><strong>Total</strong><strong>{formatPrice(quote.total)}</strong></div>
            </div>
          )}

          {buyError && <p className="error" role="alert">{buyError}</p>}
          <p className="muted">Demo checkout: payment is simulated. No real money is charged. Processing fees are paid by the organizer.</p>
          <button className="btn" onClick={buy} disabled={buying || !quote || !name.trim()}>
            {buying ? 'Processing…' : getToken() ? 'Buy' : 'Sign in to buy'}
          </button>
        </div>
      )}
    </>
  )
}
