import { moment, money, phaseLabels } from './format'
import { Link, useSearchParams } from 'react-router-dom'
import { useResource } from './data'
import type { ManagedEvent } from './types'
import { Notice, ResourceState, Stat, Status } from './ui'
import { useManagedEvent } from './Layout'

export function OrganizerEventsPage() {
  const resource = useResource<ManagedEvent[]>('/api/organizer/events')
  const [params, setParams] = useSearchParams()
  const phase = params.get('phase') ?? ''
  const events = resource.data?.filter(
    (event) => !phase || event.phase === phase,
  )
  return (
    <>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Кабинет организатора</p>
          <h1>Мои мероприятия</h1>
          <p className="muted">
            Продажи, посетители и заказы ваших мероприятий.
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          Обновить
        </button>
      </div>
      <label className="org-field org-filter">
        Стадия мероприятия
        <select
          value={phase}
          onChange={(e) =>
            setParams(e.target.value ? { phase: e.target.value } : {})
          }
        >
          <option value="">Все мероприятия</option>
          {Object.entries(phaseLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {events?.length === 0 && (
        <Notice>
          Здесь пока нет мероприятий. Попробуйте выбрать другую стадию.
        </Notice>
      )}
      <div className="org-event-grid">
        {events?.map((event) => (
          <article className="org-panel" key={event.id}>
            <Status value={event.phase} />
            <h2>
              <Link to={`/organizer/events/${event.id}`}>{event.title}</Link>
            </h2>
            <p>{moment(event.start_time)}</p>
            <p className="muted">{event.venue_name}</p>
            <dl className="org-facts">
              <div>
                <dt>Билетов продано</dt>
                <dd>
                  {event.tickets_sold} / {event.tickets_total}
                </dd>
              </div>
              <div>
                <dt>Прошли на входе</dt>
                <dd>{event.tickets_checked_in}</dd>
              </div>
              <div>
                <dt>Выручка после скидок и возвратов</dt>
                <dd>{money(event.net_revenue)}</dd>
              </div>
            </dl>
            <Link className="btn" to={`/organizer/events/${event.id}`}>
              Управлять
            </Link>
          </article>
        ))}
      </div>
    </>
  )
}
export function EventOverviewPage() {
  const event = useManagedEvent()
  const base = `/organizer/events/${event.id}`
  return (
    <>
      <div className="org-stats">
        <Stat title="Билетов в продаже всего" value={event.tickets_total} />
        <Stat title="Действующих билетов" value={event.tickets_sold} />
        <Stat title="Прошли на входе" value={event.tickets_checked_in} />
        <Stat
          title="Выручка после скидок и возвратов"
          value={money(event.net_revenue)}
        />
      </div>
      <p className="muted">
        Демонстрационные платежи. Выручка указана до вычета комиссии. Обновите
        страницу, чтобы получить свежие показатели.
      </p>
      <div className="org-event-grid">
        <article className="org-panel">
          <h2>Посетители</h2>
          <p>Найдите билет по имени или email и проверьте статус прохода.</p>
          <Link className="btn" to={`${base}/attendees`}>
            Открыть посетителей
          </Link>
        </article>
        <article className="org-panel">
          <h2>Заказы</h2>
          <p>
            Посмотрите билеты заказа, оформите возврат или отмените бесплатную
            регистрацию.
          </p>
          <Link className="btn" to={`${base}/orders`}>
            Открыть заказы
          </Link>
        </article>
      </div>
      <section className="org-panel">
        <h2>Условия мероприятия</h2>
        <p>
          Площадка: {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''}
        </p>
        <p>Вместимость площадки: {event.capacity}</p>
        <p>
          Платные продажи:{' '}
          {event.is_paid_sales_active ? 'активированы' : 'не активированы'}
        </p>
        <p>Политика возврата: {event.refund_policy || 'не указана'}</p>
        <Link to={`/events/${event.id}`}>Открыть страницу мероприятия →</Link>
      </section>
    </>
  )
}
