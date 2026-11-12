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
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState('')
  const keyRef = useRef(crypto.randomUUID())

  // load the event and its ticket types
  useEffect(() => {
    Promise.all([
      api<EventItem>(`/api/events/${id}`),
      api<TicketType[]>(`/api/events/${id}/ticket-types`),
    ])
      .then(([ev, tt]) => {
        setEvent(ev)
        setTickets(tt)
      })
      .catch((e) => setError(e.message))
  }, [id])

  // campaign QR landing: ?c=token fills in the promo code automatically
  useEffect(() => {
    if (!campaignToken) return
    api<Record<string, unknown>>(`/api/campaigns/resolve?token=${encodeURIComponent(campaignToken)}`)
      .then((data) => {
        const code = (data.code ?? data.promo_code) as string | undefined
        if (code) {
          setPromoInput(code)
          setPromo(code)
          setPromoNote(`Promo code ${code} applied from your link`)
        }
      })
      .catch((e) => setPromoNote(`The promo link did not work: ${e.message}`))
  }, [campaignToken])

  const selected = tickets.find((t) => t.id === ticketId) ?? null
  const name = attendeeName || user?.full_name || ''

  // recalculate the price whenever the choice changes
  useEffect(() => {
    keyRef.current = crypto.randomUUID() // a new choice means a new purchase
    if (!selected || !id) return
    api<Quote>('/api/orders/quote', {
      method: 'POST',
      body: { event_id: id, ticket_type_id: selected.id, quantity, promo_code: promo || undefined },
    })
      .then((q) => {
        setQuote(q)
        setQuoteError('')
      })
      .catch((e) => {
        setQuote(null)
        setQuoteError(e.message)
      })
  }, [id, selected, quantity, promo])

  async function buy() {
    if (!getToken()) {
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }
    if (!selected || !event) return
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
      setBuying(false)
    }
  }

  if (error) return <p className="error">{error}</p>
  if (!event) return <p>Loading…</p>

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
          const disabled = soldOut(t) || paidBlocked(t) || event.has_assigned_seating
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
            <input id="attendee-name" value={name} onChange={(e) => setAttendeeName(e.target.value)} />

            <label htmlFor="quantity" className="muted">Quantity (up to {maxQty})</label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />

            <label htmlFor="promo" className="muted">Promo code</label>
            <div className="row">
              <input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} />
              <button
                type="button"
                className="btn secondary"
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

          {quoteError && <p className="error" role="alert">{quoteError}</p>}
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
          <button className="btn" onClick={buy} disabled={buying || !quote || !name.trim()}>
            {buying ? 'Processing…' : getToken() ? 'Buy' : 'Sign in to buy'}
          </button>
        </div>
      )}
    </>
  )
}