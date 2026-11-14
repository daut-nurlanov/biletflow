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
  if (loading) return <Notice>Restoring your session…</Notice>
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Try again
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
        This dashboard is only available to organizers.{' '}
        <Link to="/">Browse events</Link>
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
        Event not found or unavailable to your account.{' '}
        <Link to="/organizer">My events</Link>
      </Notice>
    )
  const base = `/organizer/events/${event.id}`
  return (
    <>
      <Link className="org-back" to="/organizer">
        ← My events
      </Link>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Organizer dashboard</p>
          <h1>{event.title}</h1>
          <p className="muted">
            {moment(event.start_time)} · {event.venue_name} · Almaty time
          </p>
        </div>
        <Status value={event.phase} />
      </div>
      <nav className="org-tabs" aria-label="Event management">
        <NavLink to={base} end>
          Overview
        </NavLink>
        <NavLink to={`${base}/attendees`}>Attendees</NavLink>
        <NavLink to={`${base}/orders`}>Orders</NavLink>
      </nav>
      <Outlet context={event} />
    </>
  )
}
// eslint-disable-next-line react-refresh/only-export-components
export function useManagedEvent() {
  return useOutletContext<ManagedEvent>()
}
