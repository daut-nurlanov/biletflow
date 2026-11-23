import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { messageFor, useResource } from '../organizer/data'
import { moment } from '../organizer/format'
import { Notice, ResourceState } from '../organizer/ui'
import '../organizer/organizer.css'

interface Notification {
  id: string
  kind: string
  subject: string
  body: string
  is_read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <Notice>Restoring your session…</Notice>
  if (error)
    return (
      <Notice error>
        {error}{' '}
        <button
          className="btn secondary"
          onClick={() => window.location.reload()}
        >
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
  return <Inbox key={user.id} />
}

function Inbox() {
  const [params, setParams] = useSearchParams()
  const unread = params.get('unread_only') === 'true'
  const resource = useResource<Notification[]>(
    `/api/notifications?unread_only=${unread}`,
  )
  const lock = useRef<AbortController | null>(null)
  useEffect(() => () => lock.current?.abort(), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function markRead() {
    if (lock.current) return
    const controller = new AbortController()
    lock.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ marked_read: number }>(
        '/api/notifications/read-all',
        { method: 'POST', signal: controller.signal },
      )
      if (controller.signal.aborted) return
      setNotice(`${result.marked_read} notifications marked as read.`)
      resource.refresh()
    } catch (err) {
      if (!controller.signal.aborted) setError(messageFor(err))
    } finally {
      if (!controller.signal.aborted) {
        lock.current = null
        setBusy(false)
      }
    }
  }
  return (
    <section className="org">
      <div className="org-heading">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            Your latest 100 notifications, newest first. Opening this page does
            not mark them as read.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={resource.refresh}
        >
          Refresh notifications
        </button>
      </div>
      <div className="org-filters">
        <label className="org-field">
          Show
          <select
            name="notification_filter"
            value={unread ? 'unread' : 'all'}
            disabled={busy}
            onChange={(event) => {
              setParams(
                event.target.value === 'unread' ? { unread_only: 'true' } : {},
              )
              setNotice('')
              setError('')
            }}
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread only</option>
          </select>
        </label>
        <button
          className="btn"
          disabled={
            busy ||
            !resource.data ||
            !resource.data.some((item) => !item.is_read)
          }
          onClick={() => {
            void markRead()
          }}
        >
          {busy ? 'Marking as read…' : 'Mark all notifications as read'}
        </button>
      </div>
      <p className="muted">
        Mark all applies to all your unread notifications, including older ones
        outside this list.
      </p>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data?.length === 0 && (
        <Notice>
          {unread ? 'No unread notifications.' : 'No notifications yet.'}
        </Notice>
      )}
      <div className="notification-list">
        {resource.data?.map((item) => (
          <article className="org-panel notification-entry" key={item.id}>
            <div className="org-heading">
              <h2>{item.subject}</h2>
              <span>{item.is_read ? 'Read' : 'Unread'}</span>
            </div>
            <time className="muted" dateTime={item.created_at}>
              {moment(item.created_at)} · Almaty time
            </time>
            <p className="notification-body">{item.body}</p>
            <p className="muted">{item.kind.replaceAll('_', ' ')}</p>
          </article>
        ))}
      </div>
      <Link to="/">Browse events</Link>
    </section>
  )
}
