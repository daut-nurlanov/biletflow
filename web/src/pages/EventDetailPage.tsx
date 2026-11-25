import { EventCover } from '../components/EventCover'
import { Icon } from '../components/Icon'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CalendarButton from '../components/CalendarButton'
import { api, ApiError, getToken } from '../api'
import { useAuth } from '../auth'
import { formatDate, formatMoney, formatPrice } from '../format'
import type { EventItem, Quote, TicketType } from '../types'
import { useI18n } from '../i18n'

interface PurchaseAttempt {
  key: string
  body: { event_id: string; ticket_type_id: string; attendee_name: string; quantity: number;
    promo_code?: string; reservation_id?: string; expected_total?: string | number }
}

function readAttempt(key: string): PurchaseAttempt | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as PurchaseAttempt | null
    return value && typeof value.key === 'string' && value.body?.event_id ? value : null
  } catch {
    return null
  }
}

export default function EventDetailPage() {
  const { t: tr } = useI18n()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const campaignToken = searchParams.get('c')
  const navigate = useNavigate()
  const location = useLocation()
  const { user, sessionToken } = useAuth()

  const [event, setEvent] = useState<EventItem | null>(null)
  const [availabilityTime, setAvailabilityTime] = useState(0)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [error, setError] = useState('')

  const [ticketId, setTicketId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [attendeeName, setAttendeeName] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState('') // the promo code that is applied
  const [promoNote, setPromoNote] = useState('')
  const [quoteResult, setQuoteResult] = useState<{ selection: string; value: Quote; receivedAt: number; requestedAt: number } | null>(null)
  const [clock, setClock] = useState(0)
  const [pending, setPending] = useState<{ storageKey: string; attempt: PurchaseAttempt | null }>()
  const [lastSelection, setLastSelection] = useState('')
  const [quoteError, setQuoteError] = useState('')
  const [quoteAttempt, setQuoteAttempt] = useState(0)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportSuccess, setReportSuccess] = useState('')
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
        setAvailabilityTime(Date.now())
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
  const storageKey = user && id ? `biletflow.purchase.${user.id}.${id}` : ''
  if (pending?.storageKey !== storageKey) {
    setPending({ storageKey, attempt: storageKey ? readAttempt(storageKey) : null })
  }
  const savedAttempt = pending?.storageKey === storageKey ? pending.attempt : null
  const locked = buying || !!savedAttempt
  const name = attendeeName || user?.full_name || ''
  const promoUnapplied = promoInput.trim() !== promo
  const selection = JSON.stringify([id, selected?.id, quantity, promo, user?.id])
  // Returning to an earlier selection still requires a new quote.
  if (selection !== lastSelection) {
    setLastSelection(selection)
    setQuoteResult(null)
    setQuoteError('')
  }
  const currentQuote = quoteResult?.selection === selection ? quoteResult : null
  const quote = currentQuote?.value
  const expiresAt = currentQuote && quote?.reservation
    ? currentQuote.requestedAt + quote.reservation.remaining_seconds * 1000 : null
  const reservationSeconds = expiresAt === null ? null
    : Math.max(0, Math.ceil((expiresAt - Math.max(clock, currentQuote!.receivedAt)) / 1000))
  const promoRejected = !!promo && /promo code/i.test(quoteError)

  useEffect(() => {
    if (expiresAt === null) return
    const interval = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt])

  useEffect(() => {
    if (!selected || !id || savedAttempt) return
    const controller = new AbortController()
    const requestedAt = Date.now()
    let active = true // ignore answers that arrive after a newer request started
    api<Quote>('/api/orders/quote', {
      method: 'POST',
      signal: controller.signal,
      body: { event_id: id, ticket_type_id: selected.id, quantity, promo_code: promo || undefined,
        reserve_inventory: !!user },
    })
      .then((q) => {
        if (!active) return
        setQuoteResult({ selection, value: q, receivedAt: Date.now(), requestedAt })
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
  }, [id, selected, quantity, promo, selection, quoteAttempt, savedAttempt, user])

  async function buy() {
    if (inFlight.current) return
    if (!user || !sessionToken || getToken() !== sessionToken) {
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }
    if (!savedAttempt && (!quote || !name.trim() || !selected || !event || event.id !== id || promoUnapplied)) return
    if (!savedAttempt && expiresAt !== null && Date.now() >= expiresAt) {
      setClock(Date.now())
      return
    }
    inFlight.current = true
    setBuying(true)
    setBuyError('')
    async function sendPurchase() {
      if (getToken() !== sessionToken) return
      let attempt = readAttempt(storageKey)
      if (attempt && savedAttempt?.key !== attempt.key) {
        setPending({ storageKey, attempt })
        return
      }
      if (!attempt && savedAttempt) {
        // Another tab may have reconciled this attempt already.
        setPending({ storageKey, attempt: null })
        navigate('/my-orders')
        return
      }
      try {
        if (!attempt && selected && event && quote) {
          const next: PurchaseAttempt = { key: crypto.randomUUID(), body: {
            event_id: event.id, ticket_type_id: selected.id, attendee_name: name.trim(), quantity,
            promo_code: promo || undefined,
            ...(quote.reservation ? { reservation_id: quote.reservation.id, expected_total: quote.total } : {}),
          } }
          localStorage.setItem(storageKey, JSON.stringify(next))
          attempt = next
          setPending({ storageKey, attempt })
        }
        if (!attempt) return
        const result = await api<{ order: { id: string; status?: string } }>('/api/orders/checkout', {
          method: 'POST',
          headers: { 'Idempotency-Key': attempt.key },
          body: attempt.body,
        })
        if (!result.order?.id) throw new Error('The server did not confirm the order. Retry the saved purchase.')
        localStorage.removeItem(storageKey)
        setPending({ storageKey, attempt: null })
        if (result.order.status && result.order.status !== 'paid') {
          setBuyError('This order is no longer active. Check My orders.')
          return
        }
        navigate('/my-tickets', { state: { justBought: true } })
      } catch (e) {
        if (attempt && e instanceof ApiError && e.status >= 400 && e.status < 500 &&
            e.status !== 401 && !/busy|try again/i.test(e.message)) {
          localStorage.removeItem(storageKey)
          setPending({ storageKey, attempt: null })
          setQuoteResult(null)
          setQuoteAttempt((value) => value + 1)
        }
        setBuyError(e instanceof Error ? e.message : 'Could not complete the purchase')
      }
    }
    try {
      if (!navigator.locks) await sendPurchase()
      else await navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
        if (lock) await sendPurchase()
        else setBuyError('A purchase for this event is still processing. Check My Tickets and retry after it finishes.')
      })
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : 'Could not complete the purchase')
    } finally {
      inFlight.current = false
      setBuying(false)
    }
  }

  async function reportEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (reporting || !event) return
    const reason = reportReason.trim()
    if (!reason) {
      setReportError('Please tell us what is wrong with this event.')
      return
    }
    setReporting(true)
    setReportError('')
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}/report`, {
        method: 'POST',
        body: { reason },
      })
      setReportReason('')
      setReportOpen(false)
      setReportSuccess('Thank you. Your report was sent to the BiletFlow team.')
    } catch (e) {
      setReportError(
        e instanceof Error ? e.message : 'Could not send the event report',
      )
    } finally {
      setReporting(false)
    }
  }

  const recovery = savedAttempt && (!buying || !selected || !!error) ? (
    <div className="card buy">
      <p role="status">{tr('An interrupted purchase is saved. Retry it safely or check My orders.')}</p>
      {buyError && <p className="error" role="alert">{tr(buyError)}</p>}
      <button className="btn" type="button" onClick={buy} disabled={buying}>{tr('Retry saved purchase')}</button>
      <Link to="/my-orders">{tr('My orders')}</Link>
    </div>
  ) : null
  if (error) return <>{recovery}<p className="error" role="alert">{tr(error)}</p></>
  if (!event || event.id !== id) return <p>{tr('Loading…')}</p>

  const paidBlocked = (t: TicketType) => Number(t.price) > 0 && (!event.is_paid_sales_active || event.paid_sales_suspended)
  const soldOut = (t: TicketType) => t.quantity_available <= 0
  const end = event.end_time ? Date.parse(event.end_time) : Date.parse(event.start_time) + 2 * 60 * 60 * 1000
  const eventUnavailable = event.status === 'draft' ? tr('This is a draft preview. Tickets go on sale after publication.')
    : event.status === 'cancelled' ? tr('This event was cancelled.')
      : event.status === 'completed' || end < availabilityTime ? tr('This event has ended.')
        : event.status === 'suspended' || event.visibility === 'private' ? tr('Tickets are unavailable for this event.')
          : event.registration_opens_at && Date.parse(event.registration_opens_at) > availabilityTime
            ? tr('Registration opens {v}.', { v: formatDate(event.registration_opens_at) })
            : event.registration_closes_at && Date.parse(event.registration_closes_at) < availabilityTime
              ? tr('Registration is closed.') : ''
  const typeUnavailable = (t: TicketType) => t.is_hidden ? tr('Hidden from buyers')
    : t.sales_start_time && Date.parse(t.sales_start_time) > availabilityTime
      ? tr('Ticket sales open {v}.', { v: formatDate(t.sales_start_time) })
      : t.sales_end_time && Date.parse(t.sales_end_time) < availabilityTime
        ? tr('Sales have ended.')
        : paidBlocked(t) ? tr('paid sales not available') : ''
  const maxQty = selected ? Math.min(selected.max_per_order, selected.quantity_available) : 1

  return (
    <>
      <section className="event-lead">
        <div className="event-lead-copy">
          {event.category && <span className="event-category">{event.category}</span>}
          <h1>{event.title}</h1>
          <p className="event-meta"><Icon name="calendar" size={18} />{formatDate(event.start_time)}</p>
          <p className="event-meta"><Icon name="pin" size={18} /><span>{event.venue_name}
            {event.venue_address ? `, ${event.venue_address}` : ''}</span></p>
          <a className="btn" href="#ticket-options">{tr('View tickets')} <Icon name="arrow" size={18} /></a>
        </div>
        <EventCover image={event.image_url} category={event.category} />
      </section>
      <section className="event-information">
        {event.description && <><h2>{tr('About the event')}</h2><p>{event.description}</p></>}
        {event.refund_policy && <p className="muted">{tr('Refund policy: {v}', { v: event.refund_policy })}</p>}
        <CalendarButton key={event.id} eventId={event.id} cancelled={event.status === 'cancelled'} />
      </section>
      <div className="event-report">
        {!reportOpen && !reportSuccess && (
          <button
            type="button"
            className="btn secondary"
            aria-expanded={false}
            aria-controls="event-report-form"
            onClick={() => {
              setReportOpen(true)
              setReportError('')
            }}
          >
            {tr('Report this event')}
          </button>
        )}
        <Link to={`/support/new?event_id=${encodeURIComponent(event.id)}`}>
          {tr('Get help with this event')}
        </Link>
        {reportSuccess && (
          <p className="success" role="status">
            {reportSuccess}
          </p>
        )}
        {reportOpen && (
          <form
            id="event-report-form"
            className="form event-report-form"
            onSubmit={reportEvent}
          >
            <label htmlFor="event-report-reason">{tr('Why are you reporting this event?')}</label>
            <textarea
              id="event-report-reason"
              rows={4}
              required
              disabled={reporting}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            />
            {reportError && (
              <div className="error" role="alert">
                {reportError}
              </div>
            )}
            <div className="row">
              <button className="btn" type="submit" disabled={reporting}>
                {reporting ? tr('Sending…') : tr('Send report')}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={reporting}
                onClick={() => {
                  setReportOpen(false)
                  setReportError('')
                }}
              >
                {tr('Cancel')}
              </button>
            </div>
          </form>
        )}
      </div>

      <section className="event-checkout" aria-labelledby="ticket-options">
      <h2 id="ticket-options" tabIndex={-1}>{tr('Tickets')}</h2>
      {eventUnavailable && <p className="muted" role="status">{eventUnavailable}</p>}
      <div className="ticket-options">
        {tickets.map((t) => {
          const unavailable = typeUnavailable(t)
          const disabled = locked || soldOut(t) || !!unavailable || !!eventUnavailable || event.has_assigned_seating
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={ticketId === t.id}
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
                {soldOut(t) ? tr('Sold out') : tr('{n} left', { n: t.quantity_available })}
                {unavailable ? ` · ${unavailable}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {event.has_assigned_seating && (
        <p className="muted">
          {tr('Seat selection is not available on the website yet. Choose an event without assigned seating to buy tickets.')}
        </p>
      )}

      {recovery}
      {(!savedAttempt || buying) && selected && !eventUnavailable && !typeUnavailable(selected) && !event.has_assigned_seating && (
        <div className="card buy">
          <h3>{tr('Checkout')}</h3>
          <div className="form">
            <label htmlFor="attendee-name" className="muted">{tr('Name on the ticket')}</label>
            <input id="attendee-name" maxLength={120} disabled={buying} value={name} onChange={(e) => setAttendeeName(e.target.value)} />

            <label htmlFor="quantity" className="muted">{tr('Quantity (up to {n})', { n: maxQty })}</label>
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

            <label htmlFor="promo" className="muted">{tr('Promo code')}</label>
            <div className="row">
              <input id="promo" aria-invalid={promoRejected || undefined}
                aria-describedby={promoRejected ? 'quote-error' : promoNote ? 'promo-note' : undefined} disabled={buying}
                value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} />
              <button
                type="button"
                className="btn secondary"
                disabled={buying}
                onClick={() => {
                  setPromo(promoInput.trim())
                  setPromoNote('')
                }}
              >
                {tr('Apply')}
              </button>
            </div>
            {promoNote && <div id="promo-note" role="status" className="muted">{promoNote}</div>}
            {(promoInput || promo) && (
              <button type="button" className="btn secondary promo-clear" disabled={buying} onClick={() => {
                setPromoInput('')
                setPromo('')
                setPromoNote('')
                setQuoteError('')
              }}>{tr('Remove promotion')}</button>
            )}
          </div>

          {!quote && !quoteError && <p role="status">{tr('Calculating price…')}</p>}
          {quoteError && <div className="quote-error error" role="alert"><span id="quote-error">{quoteError}</span>
            {!promoRejected && <button type="button" className="btn secondary" onClick={() => {
              setQuoteError('')
              setQuoteAttempt((attempt) => attempt + 1)
            }}>{tr('Retry quote')}</button>}
          </div>}
          {quote && (
            <div className="totals">
              <div className="row"><span>{tr('Subtotal')}</span><span>{formatMoney(quote.subtotal)}</span></div>
              {Number(quote.discount) > 0 && (
                <div className="row"><span>{tr('Discount')}</span><span>−{formatPrice(quote.discount)}</span></div>
              )}
              {Number(quote.processing_fee) > 0 && quote.processing_fee !== undefined &&
                <div className="row muted"><span>{tr('Fee paid by organizer')}</span><span>{formatPrice(quote.processing_fee)}</span></div>}
              <div className="row"><strong>{tr('Total')}</strong><strong>{formatMoney(quote.total)}</strong></div>
            </div>
          )}

          {reservationSeconds !== null && reservationSeconds > 0 && (
            <p>{tr('Tickets reserved for {time}', { time: `${Math.floor(reservationSeconds / 60)}:${String(reservationSeconds % 60).padStart(2, '0')}` })}</p>
          )}
          {reservationSeconds === 0 && <div>
            <p role="alert">{tr('Reservation expired. After 30 seconds, refresh availability to reserve tickets again.')}</p>
            <button type="button" className="btn secondary" onClick={() => {
              setQuoteResult(null)
              setQuoteAttempt((value) => value + 1)
            }}>{tr('Refresh availability')}</button>
          </div>}
          {buyError && <p className="error" role="alert">{tr(buyError)}</p>}
          <p className="muted">{tr('Demo checkout: payment is simulated. No real money is charged. Processing fees are paid by the organizer.')}</p>
          <button className="btn" onClick={buy} disabled={buying || !quote || reservationSeconds === 0 || promoUnapplied || (!!user && !name.trim())}>
            {buying ? tr('Processing…') : getToken() ? tr('Buy') : tr('Sign in to buy')}
          </button>
        </div>
      )}
      </section>
    </>
  )
}
