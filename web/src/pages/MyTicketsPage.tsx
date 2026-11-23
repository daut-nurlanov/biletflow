import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, BASE, getToken } from '../api'
import { formatDate, formatStatus } from '../format'
import CalendarButton from '../components/CalendarButton'
import type { MyTicket } from '../types'
import { useI18n } from '../i18n'

export default function MyTicketsPage() {
  const { t: tr } = useI18n()
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
        <Link to="/login" state={{ from: '/my-tickets' }}>{tr('Sign in')}</Link> {tr('to see your tickets.')}
      </p>
    )
  }
  if (error) return <p className="error">{error}</p>
  if (!tickets) return <p>{tr('Loading…')}</p>

  return (
    <>
      <h1>{tr('My tickets')}</h1>
      {justBought && <p className="success">{tr('Purchase successful. Your ticket is below.')}</p>}
      {tickets.length === 0 && <p className="muted">{tr('You have no tickets yet.')}</p>}
      <div className="grid">
        {tickets.map((t) => {
          const title = t.event_title ?? t.event?.title ?? t.title ?? 'Event'
          const start = t.start_time ?? t.event?.start_time
          const seat = t.section ? tr('Section {s}, row {r}, seat {n}', { s: t.section, r: t.row_label ?? '', n: t.seat_number ?? '' }) : ''
          return (
            <div className="card" key={t.id}>
              <h3>{title}</h3>
              {start && <div className="muted">{formatDate(start)}</div>}
              {t.ticket_type_name && <div className="muted">{t.ticket_type_name}</div>}
              {seat && <div className="muted">{seat}</div>}
              <div className="row">
                <span className="muted">{t.attendee_name}</span>
                {t.status && (
                  <span className={`ticket-status ticket-status-${t.status}`}>
                    {formatStatus(t.status)}
                  </span>
                )}
              </div>
              {t.status === 'valid' && t.event_status !== 'cancelled' && t.event_status !== 'suspended' ? (
                <img className="qr" src={`${BASE}/api/tickets/${t.id}/qr.png`} alt={`Admission QR for ${title}`} />
              ) : <p className="muted">{tr('Admission QR unavailable: {v}.', { v: t.event_status === 'cancelled' || t.event_status === 'suspended' ? tr(`event ${t.event_status}`) : formatStatus(t.status ?? '') })}</p>}
              <a href={`${BASE}/api/tickets/${t.id}/pdf`} target="_blank" rel="noreferrer">{tr('Download PDF')}</a>
              {t.event_id && <CalendarButton eventId={t.event_id} cancelled={t.event_status === 'cancelled'} />}
              <p>
                <Link to={`/support/new?ticket_id=${encodeURIComponent(t.id)}`}>
                  {tr('Get help with this ticket')}
                </Link>
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}
