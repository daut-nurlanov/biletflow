import { moment } from './format'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { useAuth } from '../auth'
import { useResource } from './data'
import type { ManagedEvent } from './types'
import { Notice, ResourceState, Status } from './ui'
import './organizer.css'

export function OrganizerGuard() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <Notice>Проверяем вход…</Notice>
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Проверить снова
        </button>
      </Notice>
    )
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    )
  if (user.role !== 'organizer')
    return (
      <Notice error>
        Кабинет доступен организаторам.{' '}
        <Link to="/">Перейти к мероприятиям</Link>
      </Notice>
    )
  return (
    <section className="org">
      <Outlet />
    </section>
  )
}
export function EventLayout() {
  const { eventId } = useParams()
  const resource = useResource<ManagedEvent[]>('/api/organizer/events')
  const event = resource.data?.find((item) => item.id === eventId)
  if (!resource.data)
    return <ResourceState {...resource} retry={resource.refresh} />
  if (!event)
    return (
      <Notice error>
        Мероприятие не найдено или недоступно вашему аккаунту.{' '}
        <Link to="/organizer">Мои мероприятия</Link>
      </Notice>
    )
  const base = `/organizer/events/${event.id}`
  return (
    <>
      <Link className="org-back" to="/organizer">
        ← Мои мероприятия
      </Link>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Кабинет организатора</p>
          <h1>{event.title}</h1>
          <p className="muted">
            {moment(event.start_time)} · {event.venue_name} · время Алматы
          </p>
        </div>
        <Status value={event.phase} />
      </div>
      <nav className="org-tabs" aria-label="Управление мероприятием">
        <NavLink to={base} end>
          Обзор
        </NavLink>
        <NavLink to={`${base}/attendees`}>Посетители</NavLink>
        <NavLink to={`${base}/orders`}>Заказы</NavLink>
      </nav>
      <Outlet context={event} />
    </>
  )
}
// eslint-disable-next-line react-refresh/only-export-components
export function useManagedEvent() {
  return useOutletContext<ManagedEvent>()
}
