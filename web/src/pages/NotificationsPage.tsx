import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { messageFor, useResource } from '../organizer/data'
import { moment } from '../organizer/format'
import { Notice, ResourceState } from '../organizer/ui'
import '../organizer/organizer.css'
import { useI18n } from "../i18n"

interface Notification {
  id: string
  kind: string
  subject: string
  body: string
  is_read: boolean
  created_at: string
  target_type?: 'event' | 'organizer_event' | 'support' | null
  target_id?: string | null
}

function destination(item: Notification) {
  const id = item.target_id
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    if (item.target_type === 'support') return '/support/' + id
    if (item.target_type === 'event') return '/events/' + id
    if (item.target_type === 'organizer_event') return '/organizer/events/' + id
  }
  if (item.kind === 'payment_failed') return '/my-orders'
  if (['order_confirmation', 'refund_completed', 'registration_cancelled', 'event_cancelled'].includes(item.kind)) {
    return '/my-tickets'
  }
  if (item.kind === 'verify_email') return '/verify-email'
  if (item.kind === 'reset_password') return '/reset-password'
}

export default function NotificationsPage() {
  const { t: localize } = useI18n()
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <Notice>{localize('Restoring your session…')}</Notice>
  if (error)
    return (
      <Notice error>
        {error}{' '}
        <button
          className="btn secondary"
          onClick={() => window.location.reload()}
        >
          {localize("Try again")}
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
  const { t: localize } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const unread = params.get('unread_only') === 'true'
  const resource = useResource<Notification[]>(
    `/api/notifications?unread_only=${unread}`,
  )
  const lock = useRef<AbortController | null>(null)
  useEffect(() => () => lock.current?.abort(), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<number | null>(null)
  async function markRead(item?: Notification, next?: string) {
    if (lock.current) return
    if (item?.is_read && next) {
      navigate(next)
      return
    }
    const controller = new AbortController()
    lock.current = controller
    setBusy(true)
    setError('')
    setNotice(null)
    try {
      const options = { method: 'POST', signal: controller.signal }
      if (item) {
        await api(`/api/notifications/${encodeURIComponent(item.id)}/read`, options)
      } else {
        const result = await api<{ marked_read: number }>('/api/notifications/read-all', options)
        if (!controller.signal.aborted) setNotice(result.marked_read)
      }
      if (controller.signal.aborted) return
      resource.refresh()
      if (next) navigate(next)
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
          <h1>{localize("Notifications")}</h1>
          <p className="muted">
            {localize("Your latest 100 notifications, newest first. Opening this page does not mark them as read.")}
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={resource.refresh}
        >
          {localize("Refresh notifications")}
        </button>
      </div>
      <div className="org-filters">
        <label className="org-field">
          {localize("Show")}
          <select
            name="notification_filter"
            value={unread ? 'unread' : 'all'}
            disabled={busy}
            onChange={(event) => {
              setParams(
                event.target.value === 'unread' ? { unread_only: 'true' } : {},
              )
              setNotice(null)
              setError('')
            }}
          >
            <option value="all">{localize("All notifications")}</option>
            <option value="unread">{localize("Unread only")}</option>
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
          {busy ? localize("Marking as read…") : localize("Mark all notifications as read")}
        </button>
      </div>
      <p className="muted">
        {localize("Mark all applies to all your unread notifications, including older ones outside this list.")}
      </p>
      {error && <Notice error>{error}</Notice>}
      {notice !== null && <Notice>{localize('{count} notifications marked as read.', { count: notice })}</Notice>}
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data?.length === 0 && (
        <Notice>
          {unread ? localize("No unread notifications.") : localize("No notifications yet.")}
        </Notice>
      )}
      <div className="notification-list">
        {resource.data?.map((item) => {
          const next = destination(item)
          return (
          <article className="org-panel notification-entry" key={item.id}>
            <div className="org-heading">
              <h2>{localize(item.subject)}</h2>
              <span>{item.is_read ? localize("Read") : localize("Unread")}</span>
            </div>
            <time className="muted" dateTime={item.created_at}>
              {moment(item.created_at)} {localize("· Almaty time")}
            </time>
            <p className="notification-body">{localize(item.body)}</p>
            {next && <button className="btn secondary" disabled={busy} onClick={() => void markRead(item, next)}
              aria-label={localize('Open related item: {subject}', { subject: localize(item.subject) })}>
              {localize('Open related item')}
            </button>}
            {!item.is_read && !next && <button className="btn secondary" disabled={busy} onClick={() => void markRead(item)}
              aria-label={localize('Mark as read: {subject}', { subject: localize(item.subject) })}>
              {localize('Mark as read')}
            </button>}
          </article>
          )
        })}
      </div>
      <Link to="/">{localize("Browse events")}</Link>
    </section>
  )
}
