import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { formatDate } from '../format'
import type { EventItem } from '../types'
import { useI18n } from '../i18n'

export default function EventsPage() {
  const { t } = useI18n()
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<EventItem[]>('/api/events?public=true')
      .then(setEvents)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!events) return <p>{t('Loading…')}</p>

  return (
    <>
      <h1>{t('Events')}</h1>
      {events.length === 0 && <p className="muted">{t('No upcoming events.')}</p>}
      <div className="grid">
        {events.map((ev) => (
          <Link to={`/events/${ev.id}`} key={ev.id} className="card">
            <h3>{ev.title}</h3>
            <div className="muted">{formatDate(ev.start_time)}</div>
            <div className="muted">{ev.venue_name}</div>
          </Link>
        ))}
      </div>
    </>
  )
}