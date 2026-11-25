import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { EventCover } from '../components/EventCover'
import { Icon } from '../components/Icon'
import { EmptyPanel, Skeleton } from '../components/Surface'
import { formatDate, formatPrice } from '../format'
import type { EventItem, TicketType } from '../types'
import { useI18n } from '../i18n'

function EventPrice({ event }: { event: EventItem }) {
  const { t } = useI18n()
  const label = useRef<HTMLSpanElement>(null)
  const [price, setPrice] = useState<number>()

  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      const now = Date.now()
      void api<TicketType[]>(`/api/events/${event.id}/ticket-types`, { signal: controller.signal })
        .then((types) => {
          const prices = types.filter((type) => type.quantity_available > 0 && !type.is_hidden &&
            (!type.sales_start_time || Date.parse(type.sales_start_time) <= now) &&
            (!type.sales_end_time || Date.parse(type.sales_end_time) >= now))
            .map((type) => Number(type.price))
            .filter((value) => Number.isFinite(value) && (value === 0 || (event.is_paid_sales_active && !event.paid_sales_suspended)))
          if (prices.length) setPrice(Math.min(...prices))
        }).catch(() => { /* Event details still link to current availability. */ })
    }
    const target = label.current
    if (!target || !('IntersectionObserver' in window)) {
      load()
      return () => controller.abort()
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      load()
    }, { rootMargin: '120px' })
    observer.observe(target)
    return () => { observer.disconnect(); controller.abort() }
  }, [event.id, event.is_paid_sales_active, event.paid_sales_suspended])

  return <span ref={label}>{price === undefined ? t('View tickets') : price === 0
    ? t('Free') : t('From {v}', { v: formatPrice(price) })}</span>
}

export default function EventsPage() {
  const { t, lang } = useI18n()
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api<EventItem[]>('/api/events?public=true', { signal: controller.signal })
      .then(setEvents)
      .catch((e) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [attempt])

  const term = query.trim().toLocaleLowerCase(lang)
  const categories = [...new Set(events?.flatMap((event) => event.category ? [event.category] : []))].sort()
  const results = events?.filter((event) =>
    (!category || event.category === category) &&
    [event.title, event.category, event.venue_name, event.venue_address]
      .some((value) => value?.toLocaleLowerCase(lang).includes(term)),
  )

  return (
    <div className="catalogue">
      <section className="discovery-hero">
        <h1>{t('Find your next event')}</h1>
        <p>{t('Discover live events, local meetups, and more across Kazakhstan.')}</p>
      </section>
      <div className="discovery-tools">
        <label className="search-field">
          <Icon name="search" />
          <span className="visually-hidden">{t('Search events')}</span>
          <input type="search" placeholder={t('Search by event, venue, or category')}
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {categories.length > 0 && <select aria-label={t('Event category')}
          value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('All categories')}</option>
          {categories.map((name) => <option key={name}>{name}</option>)}
        </select>}
      </div>
      <section aria-labelledby="catalogue-results">
        <div className="section-heading"><h2 id="catalogue-results">{t('Events')}</h2></div>
        {error ? <EmptyPanel><p role="alert">{error}</p><button className="btn secondary" onClick={() => {
          setError('')
          setAttempt((value) => value + 1)
        }}>{t('Try again')}</button></EmptyPanel> : !results ? <Skeleton label={t('Loading…')} /> :
          !results.length ? <EmptyPanel><p>{t(events?.length ? 'No events match your search.' : 'No upcoming events.')}</p></EmptyPanel> :
            <div className="grid event-grid">
              {results.map((event) => (
                <Link to={`/events/${event.id}`} key={event.id} className="card catalogue-card">
                  <EventCover image={event.image_url} category={event.category} />
                  <div className="catalogue-info">
                    {event.category && <span className="event-category">{event.category}</span>}
                    <h3>{event.title}</h3>
                    <p className="event-meta"><Icon name="calendar" size={16} />{formatDate(event.start_time)}</p>
                    <p className="event-meta"><Icon name="pin" size={16} />{event.venue_name}</p>
                    <div className="catalogue-footer"><EventPrice event={event} /><Icon name="arrow" size={18} /></div>
                  </div>
                </Link>
              ))}
            </div>}
      </section>
    </div>
  )
}
