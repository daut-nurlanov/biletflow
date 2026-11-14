import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'
import type { SupportCase, SupportMessage } from '../types'

const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

export default function SupportCasePage() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!user || !id) return
    const controller = new AbortController()
    const fetchCase = () => {
      api<SupportCase>(`/api/support/cases/${encodeURIComponent(id)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          setSupportCase(data)
          setNotFound(false)
          setLoadError('')
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          if (err instanceof ApiError && err.status === 404) {
            setSupportCase(null)
            setNotFound(true)
            setLoadError('')
          } else {
            setLoadError(
              err instanceof Error ? err.message : 'Could not load the request',
            )
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }
    void fetchCase()
    const interval = window.setInterval(() => {
      void fetchCase()
    }, 10_000)
    return () => {
      window.clearInterval(interval)
      controller.abort()
    }
  }, [id, refreshKey, user])

  async function submitReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sending || !id) return
    const text = reply.trim()
    if (!text) {
      setReplyError('Please enter a reply.')
      return
    }
    setSending(true)
    setReplyError('')
    try {
      await api<SupportMessage>(
        `/api/support/cases/${encodeURIComponent(id)}/messages`,
        { method: 'POST', body: { message: text } },
      )
      setReply('')
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : 'Could not send the reply',
      )
    } finally {
      setSending(false)
    }
  }

  if (authLoading) return <p>Loading…</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname }}>
          Sign in
        </Link>{' '}
        to see this support request.
      </p>
    )
  }
  if (notFound) {
    return (
      <p className="error" role="alert">
        Request not found.
      </p>
    )
  }
  if (loading && !supportCase) return <p>Loading…</p>

  return (
    <>
      <Link to="/support">← All support requests</Link>
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {supportCase && (
        <>
          <div className="row">
            <div>
              <h1>{label(supportCase.category)}</h1>
              <p className="muted">
                Opened {formatDate(supportCase.created_at)}
              </p>
            </div>
            <strong>{label(supportCase.status)}</strong>
          </div>

          <div className="support-thread" aria-live="polite">
            {(supportCase.messages ?? []).map((message) => {
              const mine = message.sender_id === user.id
              return (
                <article
                  className={`support-message${mine ? ' mine' : ''}`}
                  key={message.id}
                >
                  <div className="support-message-meta">
                    <strong>{mine ? 'You' : message.sender_name ?? 'Support'}</strong>
                    <span>{formatDate(message.created_at)}</span>
                  </div>
                  <p>{message.message}</p>
                </article>
              )
            })}
          </div>

          <form className="form support-reply" onSubmit={submitReply}>
            <label htmlFor="support-reply">Reply</label>
            <textarea
              id="support-reply"
              rows={5}
              required
              maxLength={4000}
              disabled={sending}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="muted support-counter" aria-live="polite">
              {reply.length} / 4000
            </div>
            {replyError && (
              <div className="error" role="alert">
                {replyError}
              </div>
            )}
            <button className="btn" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </form>
        </>
      )}
    </>
  )
}
