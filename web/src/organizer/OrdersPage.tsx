import { moment, money, seatLabel } from './format'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useManagedEvent } from './Layout'
import { messageFor, query, useResource } from './data'
import type { Order, OrderDetail } from './types'
import { Notice, ResourceState, Status, Table } from './ui'

export function OrdersPage() {
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const resource = useResource<Order[]>(
    query(`/api/events/${event.id}/orders`, { status }),
  )
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>Заказы</h2>
          <p className="muted">
            Платежи и возвраты симулируются. Реальные деньги не списываются.
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          Обновить
        </button>
      </div>
      <label className="org-field org-filter">
        Статус заказа
        <select
          value={status}
          onChange={(e) =>
            setParams(e.target.value ? { status: e.target.value } : {})
          }
        >
          <option value="">Все статусы</option>
          <option value="paid">Подтверждён</option>
          <option value="failed">Ошибка оплаты</option>
          <option value="refunded">Возвращён</option>
          <option value="cancelled">Отменён</option>
          <option value="pending">Ожидает оплаты</option>
        </select>
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data &&
        (resource.data.length === 0 ? (
          <Notice>Заказов с такими условиями пока нет.</Notice>
        ) : (
          <Table
            caption="Заказы мероприятия"
            headings={[
              'Заказ / дата (Алматы)',
              'Покупатель',
              'Билетов',
              'Сумма',
              'Статус',
              'Действия',
            ]}
          >
            {resource.data.map((order) => (
              <tr key={order.id}>
                <td>
                  <span className="org-id">{order.id}</span>
                  <span className="org-subtext">
                    {moment(order.created_at)}
                  </span>
                </td>
                <td>
                  {order.full_name}
                  <span className="org-subtext">{order.email}</span>
                </td>
                <td>{order.ticket_count}</td>
                <td>{money(order.total_amount)}</td>
                <td>
                  <Status value={order.status} />
                </td>
                <td>
                  <Link to={`/organizer/events/${event.id}/orders/${order.id}`}>
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        ))}
    </>
  )
}

export function OrderPage() {
  const { orderId } = useParams()
  return <OrderView key={orderId} orderId={orderId ?? ''} />
}

function OrderView({ orderId }: { orderId: string }) {
  const event = useManagedEvent()
  const resource = useResource<OrderDetail>(
    `/api/orders/${encodeURIComponent(orderId)}`,
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const submitting = useRef(false)
  const order = resource.data
  const hasUsedTickets = order?.tickets.some(
    (ticket) => ticket.status === 'checked_in',
  )
  const paid = Number(order?.total_amount) > 0
  const canChange =
    order?.status === 'paid' && !hasUsedTickets && order.tickets.length > 0

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!order || !canChange || submitting.current) return
    const reason = String(
      new FormData(e.currentTarget).get('reason') ?? '',
    ).trim()
    submitting.current = true
    setBusy(true)
    setActionError('')
    setSuccess('')
    try {
      await api(
        `/api/orders/${encodeURIComponent(orderId)}/${paid ? 'refund' : 'cancel'}`,
        {
          method: 'POST',
          ...(paid ? { body: { reason: reason || null } } : {}),
        },
      )
      setConfirming(false)
      setSuccess(
        paid
          ? 'Симулированный возврат оформлен. Билеты больше не действуют.'
          : 'Бесплатная регистрация отменена. Билеты больше не действуют.',
      )
      resource.refresh()
    } catch (error) {
      setActionError(messageFor(error))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <Link to={`/organizer/events/${event.id}/orders`}>← Все заказы</Link>
      <h2>
        Заказ <span className="org-id">{orderId}</span>
      </h2>
      {success && <Notice>{success}</Notice>}
      <ResourceState {...resource} retry={resource.refresh} />
      {order &&
        (order.event_id !== event.id ? (
          <Notice error>Этот заказ относится к другому мероприятию.</Notice>
        ) : (
          <>
            <div className="org-panel">
              <div className="org-heading">
                <div>
                  <Status value={order.status} />
                  <p>{moment(order.created_at)} · время Алматы</p>
                </div>
                <strong className="org-order-amount">
                  {money(order.total_amount)}
                </strong>
              </div>
              <p>Промокод: {order.promo_code_applied || 'не применён'}</p>
              <p className="muted">
                Демонстрационный заказ. Все финансовые действия — симуляция.
              </p>
            </div>
            <h3>Билеты заказа</h3>
            {order.tickets.length === 0 ? (
              <Notice>Билеты не выпущены.</Notice>
            ) : (
              <Table
                caption="Билеты заказа"
                headings={['Посетитель', 'Тип билета', 'Место', 'Статус']}
              >
                {order.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      {ticket.attendee_name}
                      <span className="org-subtext org-id">{ticket.id}</span>
                    </td>
                    <td>{ticket.ticket_type_name}</td>
                    <td>{seatLabel(ticket)}</td>
                    <td>
                      <Status value={ticket.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            {hasUsedTickets && (
              <Notice>
                По этому заказу уже прошли на мероприятие. Возврат и отмена
                недоступны.
              </Notice>
            )}
            {canChange && !confirming && (
              <div className="org-action">
                <button
                  className="btn org-danger"
                  onClick={() => {
                    setConfirming(true)
                    setActionError('')
                  }}
                >
                  {paid ? 'Вернуть оплату…' : 'Отменить регистрацию…'}
                </button>
              </div>
            )}
            {canChange && confirming && (
              <section
                className="org-panel org-confirm"
                aria-labelledby="confirm-title"
              >
                <h3 id="confirm-title">
                  {paid
                    ? 'Подтвердите полный возврат'
                    : 'Подтвердите отмену регистрации'}
                </h3>
                <p>
                  Заказ <span className="org-id">{order.id}</span> ·{' '}
                  {order.tickets.length} билетов · {money(order.total_amount)}.
                </p>
                <p>
                  Все билеты заказа станут недействительными, их количество
                  вернётся в продажу.{' '}
                  {paid &&
                    'Возврат симулируется, реальные деньги не переводятся.'}
                </p>
                <form onSubmit={submit}>
                  {paid && (
                    <label className="org-field">
                      Причина возврата (необязательно)
                      <textarea
                        autoFocus
                        name="reason"
                        rows={3}
                        maxLength={1000}
                        disabled={busy}
                      />
                    </label>
                  )}
                  {actionError && (
                    <Notice error>
                      {actionError}
                      <p>
                        Если ответ потерян, обновите заказ и проверьте его
                        статус перед повторной попыткой.
                      </p>
                    </Notice>
                  )}
                  <div className="org-actions">
                    <button
                      className="btn org-danger"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? 'Выполняется…'
                        : paid
                          ? 'Подтвердить возврат'
                          : 'Подтвердить отмену'}
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Назад
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(false)
                        resource.refresh()
                      }}
                    >
                      Обновить статус
                    </button>
                  </div>
                </form>
              </section>
            )}
            {order.refunds.length > 0 && (
              <section className="org-panel">
                <h3>Оформленные возвраты</h3>
                {order.refunds.map((refund) => (
                  <div key={refund.id}>
                    <p>
                      {money(refund.amount)} · {moment(refund.created_at)}
                    </p>
                    <p>{refund.reason || 'Причина не указана'}</p>
                  </div>
                ))}
              </section>
            )}
          </>
        ))}
    </>
  )
}
