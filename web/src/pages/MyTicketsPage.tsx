import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, BASE } from '../api'
import { useAuth } from '../auth'
import { formatDate, formatStatus } from '../format'
import CalendarButton from '../components/CalendarButton'
import { Icon } from '../components/Icon'
import { EmptyPanel, Skeleton } from '../components/Surface'
import type { MyTicket } from '../types'
import { useI18n } from '../i18n'

function admissionStatus(ticket: MyTicket) {
  return ticket.status === 'valid' && (ticket.event_status === 'cancelled' || ticket.event_status === 'suspended')
    ? ticket.event_status : ticket.status
}

function eventEnded(ticket: MyTicket, asOf: number) {
  const start = ticket.start_time ?? ticket.event?.start_time
  const end = ticket.end_time ? Date.parse(ticket.end_time) : start ? Date.parse(start) + 2 * 60 * 60 * 1000 : NaN
  return ticket.event_status === 'completed' || end < asOf
}

function TicketPreview({ ticket, pastEvent }: { ticket: MyTicket; pastEvent: boolean }) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const title = ticket.event_title ?? ticket.event?.title ?? ticket.title ?? t('Event')
  const start = ticket.start_time ?? ticket.event?.start_time
  const venue = ticket.venue_name ?? ticket.event?.venue_name
  const status = admissionStatus(ticket)
  const eventBlocked = ticket.status === 'valid' && (ticket.event_status === 'cancelled' || ticket.event_status === 'suspended')
  return (
    <article className="card digital-ticket">
      <div className="digital-ticket-header"><Icon name="ticket" size={24} /><h3>{title}</h3></div>
      <div className="digital-ticket-body">
        {start && <p className="event-meta"><Icon name="calendar" size={16} />{formatDate(start)}</p>}
        {venue && <p className="event-meta"><Icon name="pin" size={16} />{venue}</p>}
        {pastEvent && <p className="event-meta">{t('Past event')}</p>}
        <div className="row">
          <strong>{ticket.ticket_type_name ?? ticket.attendee_name}</strong>
          {status && <span className={`ticket-status ticket-status-${status}`}>{eventBlocked ? t(`event ${status}`) : formatStatus(status)}</span>}
        </div>
        {ticket.section && <span className="muted">{t('Section {s}, row {r}, seat {n}', {
          s: ticket.section, r: ticket.row_label ?? '', n: ticket.seat_number ?? '',
        })}</span>}
      </div>
      <div className="digital-ticket-actions">
        <button className={`btn${status === 'valid' ? '' : ' secondary'}`}
          aria-label={t('Open ticket for {v}, ending {n}', { v: title, n: ticket.id.slice(-8) })}
          onClick={() => dialog.current?.showModal()}>
          <Icon name={status === 'valid' ? 'qr' : 'ticket'} size={18} />{t('Open ticket')}
        </button>
        <a href={`${BASE}/api/tickets/${ticket.id}/pdf`} target="_blank" rel="noreferrer">{t('Download PDF')}</a>
        {ticket.event_id && <CalendarButton eventId={ticket.event_id} cancelled={ticket.event_status === 'cancelled'} />}
        <Link to={`/support/new?ticket_id=${encodeURIComponent(ticket.id)}`}>{t('Get help with this ticket')}</Link>
      </div>
      <dialog className="ticket-dialog" ref={dialog} aria-labelledby={`ticket-${ticket.id}`}>
        <div className="ticket-dialog-heading">
          <h2 id={`ticket-${ticket.id}`}>{title}</h2>
          <button className="btn secondary" aria-label={t('Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
        </div>
        <div className="ticket-dialog-content">
          {ticket.attendee_name && <p>{ticket.attendee_name}</p>}
          {status === 'valid'
            ? <img className="qr" src={`${BASE}/api/tickets/${ticket.id}/qr.png`} alt={t('Admission QR for {v}', { v: title })} />
            : <p>{t('Admission QR unavailable: {v}.', { v: eventBlocked ? t(`event ${status}`) : formatStatus(status ?? '') })}</p>}
        </div>
      </dialog>
    </article>
  )
}

export default function MyTicketsPage() {
  const { t } = useI18n()
  const { user, loading, error } = useAuth()
  return (
    <div className="wallet">
      <h1>{t('My tickets')}</h1>
      {loading ? <Skeleton label={t('Loading…')} /> :
        error ? <EmptyPanel icon="ticket"><p role="alert">{error}</p>
          <button className="btn secondary" onClick={() => window.location.reload()}>{t('Try again')}</button>
        </EmptyPanel> :
          user ? <TicketWallet key={user.id} /> :
            <EmptyPanel icon="ticket"><p><Link to="/login" state={{ from: '/my-tickets' }}>{t('Sign in')}</Link> {t('to see your tickets.')}</p></EmptyPanel>}
    </div>
  )
}

function TicketWallet() {
  const { t } = useI18n()
  const location = useLocation()
  const justBought = (location.state as { justBought?: boolean } | null)?.justBought
  const [wallet, setWallet] = useState<{ tickets: MyTicket[]; asOf: number }>()
  const tickets = wallet?.tickets
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let pending: AbortController | undefined
    function reload() {
      if (pending || document.visibilityState === 'hidden') return
      const controller = new AbortController()
      pending = controller
      api<MyTicket[]>('/api/tickets/my-tickets', { signal: controller.signal })
        .then((rows) => {
          if (controller.signal.aborted) return
          setWallet({ tickets: rows, asOf: Date.now() })
          setError('')
        })
        .catch((e) => { if (!controller.signal.aborted) setError(e.message) })
        .finally(() => { if (pending === controller) pending = undefined })
    }
    reload()
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => {
      pending?.abort()
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [attempt])

  const groups = { upcoming: [] as MyTicket[], past: [] as MyTicket[] }
  const now = wallet?.asOf ?? 0
  for (const ticket of tickets ?? []) {
    groups[admissionStatus(ticket) === 'valid' && !eventEnded(ticket, now) ? 'upcoming' : 'past'].push(ticket)
  }

  return (
    <>
      {justBought && <p className="success" role="status">{t('Purchase successful. Your ticket is below.')}</p>}
      {error ? <EmptyPanel icon="ticket"><p role="alert">{error}</p><button className="btn secondary" onClick={() => {
          setError('')
          setAttempt((value) => value + 1)
        }}>{t('Try again')}</button></EmptyPanel> :
          !tickets ? <Skeleton label={t('Loading…')} /> : !tickets.length ? <EmptyPanel icon="ticket">
            <p>{t('You have no tickets yet.')}</p><Link className="btn" to="/">{t('Browse events')}</Link>
          </EmptyPanel> : ([
            ['upcoming', 'Upcoming tickets'],
            ['past', 'Past and inactive tickets'],
          ] as const).map(([group, title]) => groups[group].length > 0 && <section className="wallet-group" key={group}>
            <h2>{t(title)}</h2>
            <div className="grid wallet-grid">{groups[group].map((ticket) =>
              <TicketPreview key={ticket.id} ticket={ticket} pastEvent={eventEnded(ticket, now)} />)}</div>
          </section>)}
    </>
  )
}
