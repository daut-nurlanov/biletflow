import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate, formatPrice, formatStatus } from '../format'
import { useI18n } from '../i18n'

interface MyOrder {
  id: string
  event_id: string
  event_title: string
  start_time: string
  status: string
  total_amount: string | number
  ticket_count: number
  promo_code_applied?: string | null
  created_at: string
}

// Attendees see their orders here. A free registration can be cancelled by the
// attendee; a paid order is refunded by the organizer (SRS: cancel and refunds).
export default function MyOrdersPage() {
  const { t } = useI18n()
  const { user, loading } = useAuth()
  const [orders, setOrders] = useState<MyOrder[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api<MyOrder[]>('/api/orders/my-orders')
      .then((data) => {
        setOrders(data)
        setError('')
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load your orders'),
      )
  }, [])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  async function cancel(order: MyOrder) {
    if (busy) return
    setBusy(order.id)
    setError('')
    setNotice('')
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/cancel`, { method: 'POST' })
      setNotice(`Your registration for ${order.event_title} was cancelled.`)
      setConfirming(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this registration')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p>{t('Loading…')}</p>
  if (!user) {
    return (
      <p>
        <Link to="/login" state={{ from: '/my-orders' }}>{t('Sign in')}</Link> {t('to see your orders.')}
      </p>
    )
  }
  if (error && !orders) return <p className="error">{error}</p>
  if (!orders) return <p>{t('Loading…')}</p>

  return (
    <>
      <h1>{t('My orders')}</h1>
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {orders.length === 0 && (
        <p className="muted">
          {t('You have no orders yet.')} <Link to="/">{t('Browse events')}</Link>
        </p>
      )}
      <div className="grid">
        {orders.map((o) => {
          const free = Number(o.total_amount) === 0
          const active = o.status === 'paid'
          return (
            <div className="card" key={o.id}>
              <h3>{o.event_title}</h3>
              <div className="muted">{formatDate(o.start_time)}</div>
              <div className="row">
                <span>
                  {o.ticket_count === 1 ? t('{n} ticket', { n: 1 }) : t('{n} tickets', { n: o.ticket_count })} ·{' '}
                  {formatPrice(o.total_amount)}
                </span>
                <span className={`ticket-status ticket-status-${o.status === 'paid' ? 'valid' : o.status}`}>
                  {o.status === 'paid' && free ? t('Registered') : formatStatus(o.status)}
                </span>
              </div>
              {o.promo_code_applied && <div className="muted">{t('Promo code: {v}', { v: o.promo_code_applied })}</div>}
              <div className="muted">{t('Ordered {v}', { v: formatDate(o.created_at) })}</div>
              <div className="muted" style={{ wordBreak: 'break-all' }}>{t('Order reference: {v}', { v: o.id })}</div>
              {active && free && (
                confirming === o.id ? (
                  <p>
                    {t('Cancel this registration? Your tickets stop working.')}{' '}
                    <button className="btn" onClick={() => cancel(o)} disabled={busy === o.id}>
                      {busy === o.id ? t('Cancelling…') : t('Yes, cancel')}
                    </button>{' '}
                    <button className="btn secondary" onClick={() => setConfirming(null)} disabled={busy === o.id}>
                      {t('Keep it')}
                    </button>
                  </p>
                ) : (
                  <p>
                    <button className="btn secondary" onClick={() => setConfirming(o.id)}>
                      {t('Cancel registration')}
                    </button>
                  </p>
                )
              )}
              {active && !free && (
                <p className="muted">
                  {t('Paid orders are refunded by the organizer. Ask for a refund through support.')}
                </p>
              )}
              <p>
                <Link to={`/support/new?order_id=${encodeURIComponent(o.id)}`}>{t('Get help with this order')}</Link>
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}
