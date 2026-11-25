import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { WorkspaceNav } from '../components/Surface'
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
      <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
    )
  if (user.role !== 'platform_admin')
    return (
      <Notice error>
        The admin portal is only for platform administrators.{' '}
        <Link to="/">Browse events</Link>
      </Notice>
    )
  return (
    <AdminWorkspace>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Platform administration</p>
          <h1>Admin portal</h1>
          <p className="muted">All money is simulated. Actions are recorded in the audit log.</p>
        </div>
      </div>
      <Outlet />
    </AdminWorkspace>
  )
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  return (
    <section className="org workspace">
      <WorkspaceNav label="Admin sections" links={[
        { to: '/admin', label: 'Overview', icon: 'grid', end: true },
        { to: '/admin/users', label: 'Users', icon: 'user' },
        { to: '/admin/events', label: 'Events', icon: 'calendar' },
        { to: '/admin/orders', label: 'Orders', icon: 'receipt' },
        { to: '/admin/payment-failures', label: 'Payment failures', icon: 'shield' },
        { to: '/admin/moderation', label: 'Reports and promos', icon: 'tag' },
        { to: '/admin/money', label: 'Fees and refunds', icon: 'chart' },
        { to: '/support', label: 'Support cases', icon: 'chat' },
      ]} />
      <div className="workspace-content">{children}</div>
    </section>
  )
}
