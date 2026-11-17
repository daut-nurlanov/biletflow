import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'
import type { SupportCase, SupportMessage, SupportStatus, User } from '../types'
import { supportLabel, supportStatuses } from '../support/labels'
import '../support/support.css'

export default function SupportCasePage() {
  const { id } = useParams()
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <p>Loading…</p>
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  if (!user)
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname + location.search }}>
          Sign in
        </Link>{' '}
        to see this support request.
      </p>
    )
  if (!id) return <p role="alert">Request not found.</p>
  return <CaseView key={`${user.id}:${id}`} id={id} user={user} />
}

function CaseView({ id, user }: { id: string; user: User }) {
  const location = useLocation()
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reply, setReply] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [draftStatus, setDraftStatus] = useState<SupportStatus | null>(null)
  const [confirmEscalation, setConfirmEscalation] = useState(false)
  const readController = useRef<AbortController | null>(null)
  const writeController = useRef<AbortController | null>(null)
  const root = `/api/support/cases/${encodeURIComponent(id)}`

  useEffect(() => () => writeController.current?.abort(), [])
  useEffect(() => {
    if (busy) return
    const controller = new AbortController()
    readController.current = controller
    let timer: number | undefined
    async function fetchCase() {
      try {
        const data = await api<SupportCase>(root, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setSupportCase(data)
        setNotFound(false)
        setLoadError('')
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 404) {
          setSupportCase(null)
          setNotFound(true)
          setLoadError('')
        } else
          setLoadError(
            err instanceof Error ? err.message : 'Could not load the request',
          )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = window.setTimeout(() => {
            void fetchCase()
          }, 10_000)
        }
      }
    }
    void fetchCase()
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [root, refreshKey, busy])

  async function act(action: 'reply' | 'status' | 'assign' | 'escalate') {
    if (writeController.current || !supportCase || loadError) return
    const text = reply.trim()
    if (action === 'reply' && (!text || text.length > 4000)) {
      setActionError('Please enter a reply of at most 4000 characters.')
      return
    }
    const controller = new AbortController()
    writeController.current = controller
    readController.current?.abort()
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      const result = await api<SupportCase | SupportMessage>(
        root +
          (action === 'reply'
            ? '/messages'
            : action === 'escalate'
              ? '/escalate'
              : ''),
        {
          method: action === 'reply' || action === 'escalate' ? 'POST' : 'PUT',
          body:
            action === 'reply'
              ? { message: text }
              : action === 'status'
                ? { status: draftStatus ?? supportCase.status }
                : action === 'assign'
                  ? { assigned_to: user.id }
                  : undefined,
          signal: controller.signal,
        },
      )
      if (controller.signal.aborted) return
      if (action === 'reply') setReply('')
      else
        setSupportCase((current) =>
          current ? ({ ...current, ...result } as SupportCase) : null,
        )
      if (action === 'status') setDraftStatus(null)
      setConfirmEscalation(false)
      setNotice(
        action === 'reply'
          ? 'Reply sent.'
          : action === 'status'
            ? 'Status updated.'
            : action === 'assign'
              ? 'Request assigned to you.'
              : 'Request escalated to platform support.',
      )
    } catch (err) {
      if (controller.signal.aborted) return
      setActionError(
        err instanceof Error ? err.message : 'Could not update the request',
      )
    } finally {
      if (!controller.signal.aborted) {
        writeController.current = null
        setBusy(false)
        setRefreshKey((value) => value + 1)
      }
    }
  }
  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void act('reply')
  }
  const manager =
    supportCase?.your_role_in_case === 'handler' ||
    supportCase?.your_role_in_case === 'admin'
  const handler =
    user.role === 'organizer' && supportCase?.your_role_in_case === 'handler'
  const disabled = busy || Boolean(loadError)
  const from = (location.state as { fromSupport?: unknown } | null)?.fromSupport
  const eventBack = supportCase?.event_id
    ? `/organizer/events/${supportCase.event_id}/support`
    : ''
  const back =
    typeof from === 'string' &&
    (from === '/support' ||
      from.startsWith('/support?') ||
      (eventBack && (from === eventBack || from.startsWith(eventBack + '?'))))
      ? from
      : '/support'
  if (notFound)
    return (
      <p className="error" role="alert">
        Request not found.
      </p>
    )
  if (loading && !supportCase) return <p>Loading…</p>
  return (
    <>
      <div className="support-heading">
        <Link to={back}>← All support requests</Link>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          Refresh request
        </button>
      </div>
      {loadError && (
        <div className="error" role="alert">
          <p>{loadError}</p>
          <button
            className="btn secondary"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            Retry request
          </button>
        </div>
      )}
      {supportCase && (
        <>
          <div className="support-heading">
            <div>
              <h1>{supportLabel(supportCase.category)}</h1>
              <p className="muted">
                Opened {formatDate(supportCase.created_at)}
              </p>
            </div>
            <strong data-support-status>
              {supportStatuses[supportCase.status] ??
                supportLabel(supportCase.status)}
            </strong>
          </div>
          <section className="support-context" aria-label="Request context">
            <p>
              {supportCase.kind === 'organizer'
                ? 'Platform support request'
                : 'Attendee support request'}{' '}
              · {supportCase.opened_by_name ?? 'Requester'}
            </p>
            <p>
              Event:{' '}
              {handler && supportCase.event_id ? (
                <Link to={`/organizer/events/${supportCase.event_id}`}>
                  {supportCase.event_title ?? 'Event overview'}
                </Link>
              ) : (
                (supportCase.event_title ?? 'General support')
              )}
            </p>
            {supportCase.order_id && (
              <p>
                Order:{' '}
                {handler && supportCase.event_id ? (
                  <Link
                    to={`/organizer/events/${supportCase.event_id}/orders/${supportCase.order_id}`}
                  >
                    {supportCase.order_id}
                  </Link>
                ) : (
                  supportCase.order_id
                )}
              </p>
            )}
            {supportCase.ticket_id && <p>Ticket: {supportCase.ticket_id}</p>}
            <p>
              Assigned to:{' '}
              {supportCase.assigned_to === user.id
                ? 'You'
                : (supportCase.assigned_to_name ??
                  (supportCase.assigned_to
                    ? 'Support team member'
                    : 'Not assigned'))}
            </p>
            {supportCase.escalated && (
              <p className="support-escalated">
                Escalated to platform support. The organizer and platform team
                can continue helping here.
              </p>
            )}
          </section>
          {manager && (
            <section
              className="support-controls"
              aria-label="Support management"
            >
              <h2>Manage request</h2>
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void act('status')
                }}
              >
                <label htmlFor="support-status">Status</label>
                <select
                  id="support-status"
                  name="status"
                  value={draftStatus ?? supportCase.status}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as SupportStatus)
                  }
                >
                  {Object.entries(supportStatuses).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    disabled ||
                    (draftStatus ?? supportCase.status) === supportCase.status
                  }
                >
                  Save status
                </button>
              </form>
              <div className="support-actions">
                {supportCase.assigned_to !== user.id && (
                  <button
                    className="btn secondary"
                    disabled={disabled}
                    onClick={() => {
                      void act('assign')
                    }}
                  >
                    {supportCase.assigned_to
                      ? 'Take over request'
                      : 'Assign to me'}
                  </button>
                )}
                {handler && !supportCase.escalated && !confirmEscalation && (
                  <button
                    className="btn secondary"
                    disabled={disabled}
                    onClick={() => setConfirmEscalation(true)}
                  >
                    Escalate to platform support
                  </button>
                )}
              </div>
              {confirmEscalation && !supportCase.escalated && (
                <div
                  className="support-confirm"
                  role="group"
                  aria-label="Confirm escalation"
                >
                  <p>
                    The platform team will receive this request and its
                    conversation. You can continue replying here.
                  </p>
                  <div className="support-actions">
                    <button
                      className="btn"
                      disabled={disabled}
                      onClick={() => {
                        void act('escalate')
                      }}
                    >
                      Confirm escalation
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => setConfirmEscalation(false)}
                    >
                      Cancel escalation
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          {notice && <p role="status">{notice}</p>}
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
          <div className="support-thread" aria-live="polite">
            {(supportCase.messages ?? []).map((message) => (
              <article
                className={`support-message${message.sender_id === user.id ? ' mine' : ''}`}
                key={message.id}
              >
                <div className="support-message-meta">
                  <strong>
                    {message.sender_id === user.id
                      ? 'You'
                      : (message.sender_name ?? 'Support')}
                  </strong>
                  <span>{formatDate(message.created_at)}</span>
                </div>
                <p>{message.message}</p>
              </article>
            ))}
          </div>
          <form className="form support-reply" onSubmit={submitReply}>
            <label htmlFor="support-reply">Reply</label>
            <textarea
              id="support-reply"
              rows={5}
              required
              maxLength={4000}
              disabled={disabled}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            <div className="muted support-counter" aria-live="polite">
              {reply.length} / 4000
            </div>
            <button className="btn" type="submit" disabled={disabled}>
              {busy ? 'Saving…' : 'Send reply'}
            </button>
          </form>
        </>
      )}
    </>
  )
}
