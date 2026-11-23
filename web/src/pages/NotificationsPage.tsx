import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'

interface AppNotification {
  id: string
  kind: string
  subject: string
  body: string
  is_read: boolean
  created_at: string
}

// In this demo every "email" the platform sends is also stored here, so this
// page is where verification codes, purchase and refund messages can be read.
export default function NotificationsPage() {
  const { user, loading } = useAuth()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<AppNotification[]>('/api/notifications')
      .then((data) => {
        setItems(data)
        setError('')
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load notifications'),
      )
  }, [])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  async function markAllRead() {
    if (busy) return
    setBusy(true)
    try {
      await api('/api/notifications/read-all', { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update notifications')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p>Loading…</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: '/notifications' }}>Sign in</Link> to see your
        notifications.
      </p>
    )
  }
  if (error && !items) return <p className="error">{error}</p>
  if (!items) return <p>Loading…</p>

  const unread = items.filter((n) => !n.is_read).length

  return (
    <>
      <h1>Notifications</h1>
      <p className="muted">
        Messages the platform would send by email: verification codes, purchases,
        refunds, event changes and support replies.
      </p>
      {error && <p className="error">{error}</p>}
      <p>
        <button className="btn secondary" onClick={markAllRead} disabled={busy || unread === 0}>
          Mark all as read{unread > 0 ? ` (${unread})` : ''}
        </button>
      </p>
      {items.length === 0 && <p className="muted">No notifications yet.</p>}
      {items.map((n) => (
        <div className="card" key={n.id} style={{ marginBottom: 12 }}>
          <h3>
            {n.subject}
            {!n.is_read && <span className="muted"> · new</span>}
          </h3>
          <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{n.body}</p>
          <p className="muted">{formatDate(n.created_at)}</p>
        </div>
      ))}
    </>
  )
}
