import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { Icon, type IconName } from './Icon'

export function Brand() {
  return <><span className="brand-mark"><Icon name="ticket" size={22} /></span><span>BiletFlow</span></>
}

export function EmptyPanel({ icon = 'calendar', children }: { icon?: IconName; children: ReactNode }) {
  return <div className="empty-panel"><span className="empty-symbol"><Icon name={icon} size={24} /></span>{children}</div>
}

export function Skeleton({ label, count = 3 }: { label: string; count?: number }) {
  return <div role="status" className="skeleton-group">
    <span className="visually-hidden">{label}</span>
    {Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} aria-hidden="true" />)}
  </div>
}

export interface WorkspaceLink {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

export function WorkspaceNav({ label, links }: { label: string; links: WorkspaceLink[] }) {
  return <nav className="workspace-nav" aria-label={label}>
    <span className="workspace-label">{label}</span>
    {links.map(({ to, label: title, icon, end }) => <NavLink key={to} to={to} end={end}>
      <Icon name={icon} size={18} /><span>{title}</span>
    </NavLink>)}
  </nav>
}
