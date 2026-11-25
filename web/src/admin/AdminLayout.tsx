import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { WorkspaceNav } from '../components/Surface'
import { Notice } from '../organizer/ui'
import '../organizer/organizer.css'
import { useI18n } from "../i18n"

export function AdminGuard() {
  const { t: localize } = useI18n()
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <Notice>{localize("Restoring your session…")}</Notice>
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          {localize("Try again")}
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
        {localize("The admin portal is only for platform administrators.")}{' '}
        <Link to="/">{localize("Browse events")}</Link>
      </Notice>
    )
  return (
    <AdminWorkspace>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">{localize("Platform administration")}</p>
          <h1>{localize("Admin portal")}</h1>
          <p className="muted">{localize("All money is simulated. Actions are recorded in the audit log.")}</p>
        </div>
      </div>
      <Outlet />
    </AdminWorkspace>
  )
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const { t: localize } = useI18n()
  return (
    <section className="org workspace">
      <WorkspaceNav label={localize("Admin sections")} links={[
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
