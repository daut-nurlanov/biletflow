import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { Notice } from '../organizer/ui'
import '../organizer/organizer.css'

export function AdminGuard() {
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
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    )
  if (user.role !== 'platform_admin')
    return (
      <Notice error>
        The admin portal is only for platform administrators.{' '}
        <Link to="/">Browse events</Link>
      </Notice>
    )
  return (
    <section className="org">
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Platform administration</p>
          <h1>Admin portal</h1>
          <p className="muted">All money is simulated. Actions are recorded in the audit log.</p>
        </div>
      </div>
      <nav className="org-tabs" aria-label="Admin sections">
        <NavLink to="/admin" end>
          Overview
        </NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/events">Events</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/moderation">Reports and promos</NavLink>
        <NavLink to="/admin/money">Fees and refunds</NavLink>
        <Link to="/support">Support cases</Link>
      </nav>
      <Outlet />
    </section>
  )
}
