import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'
import type { SupportCase } from '../types'

const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

export default function SupportPage() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [cases, setCases] = useState<SupportCase[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    api<SupportCase[]>('/api/support/cases', {
      signal: controller.signal,
    })
      .then((items) => {
        setCases(
          [...items].sort(
            (a, b) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime(),
          ),
        )
        setError('')
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Could not load requests',
          )
        }
      })
    return () => controller.abort()
  }, [user])

  if (authLoading) return <p>Loading…</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname }}>
          Sign in
        </Link>{' '}
        to see your support requests.
      </p>
    )
  }

  return (
    <>
      <div className="row">
        <h1>Support</h1>
        <Link className="btn" to="/support/new">
          New request
        </Link>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!cases && !error && <p>Loading…</p>}
      {cases?.length === 0 && (
        <p className="muted">You have no support requests yet.</p>
      )}
      <div className="grid">
        {cases?.map((item) => (
          <Link className="card" to={`/support/${item.id}`} key={item.id}>
            <div className="row">
              <h3>{label(item.category)}</h3>
              <span>{label(item.status)}</span>
            </div>
            <p>{item.event_title ?? 'General support'}</p>
            <div className="muted">Updated {formatDate(item.updated_at)}</div>
          </Link>
        ))}
      </div>
    </>
  )
}
