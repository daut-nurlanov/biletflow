import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { formatDate, formatPrice } from '../format'
import type { EventItem, TicketType } from '../types'

export default function EventDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const campaignToken = searchParams.get('c') //campaign QR token, used by the checkout flow later

  const [event, setEvent] = useState<EventItem | null>(null)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [error, setError] = useState('')

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

  if (error) return <p className="error">{error}</p>
  if (!event) return <p>Loading…</p>

  return (
    <>
      <h1>{event.title}</h1>
      <p className="muted">
        {formatDate(event.start_time)} · {event.venue_name}
        {event.venue_address ? `, ${event.venue_address}` : ''}
      </p>
      {campaignToken && <p className="muted">Campaign link: {campaignToken}</p>}
      {event.description && <p>{event.description}</p>}

      <h2>Tickets</h2>
      <div className="grid">
        {tickets.map((t) => (
          <div className="card" key={t.id}>
            <div className="row">
              <h3>{t.name}</h3>
              <strong>{formatPrice(t.price)}</strong>
            </div>
            {t.description && <div className="muted">{t.description}</div>}
            <div className="muted">Remaining: {t.quantity_available}</div>
          </div>
        ))}
      </div>
    </>
  )
}
