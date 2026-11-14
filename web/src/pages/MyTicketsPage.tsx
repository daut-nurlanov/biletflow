import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, BASE, getToken } from '../api'
import { formatDate } from '../format'
import type { MyTicket } from '../types'

export default function MyTicketsPage() {
  const location = useLocation()
  const justBought = (location.state as { justBought?: boolean } | null)?.justBought
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)
  const [error, setError] = useState('')
  const signedIn = !!getToken()

  useEffect(() => {
    if (!signedIn) return
    api<MyTicket[]>('/api/tickets/my-tickets')
      .then(setTickets)
      .catch((e) => setError(e.message))
  }, [signedIn])

  if (!signedIn) {
    return (
      <p>
        <Link to="/login" state={{ from: '/my-tickets' }}>Sign in</Link> to see your tickets.
      </p>
    )
  }
  if (error) return <p className="error">{error}</p>
  if (!tickets) return <p>Loading…</p>

  return (
    <>
      <h1>My tickets</h1>
      {justBought && <p className="success">Purchase successful. Your ticket is below.</p>}
      {tickets.length === 0 && <p className="muted">You have no tickets yet.</p>}
      <div className="grid">
        {tickets.map((t) => {
          const title = t.event_title ?? t.event?.title ?? t.title ?? 'Event'
          const start = t.start_time ?? t.event?.start_time
          const seat = t.section ? `Section ${t.section}, row ${t.row_label}, seat ${t.seat_number}` : ''
          return (
            <div className="card" key={t.id}>
              <h3>{title}</h3>
              {start && <div className="muted">{formatDate(start)}</div>}
              {t.ticket_type_name && <div className="muted">{t.ticket_type_name}</div>}
              {seat && <div className="muted">{seat}</div>}
              <div className="muted">{t.attendee_name} · {t.status}</div>
              <img className="qr" src={`${BASE}/api/tickets/${t.id}/qr.png`} alt="Ticket QR code" />
              <a href={`${BASE}/api/tickets/${t.id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
            </div>
          )
        })}
      </div>
    </>
  )
}