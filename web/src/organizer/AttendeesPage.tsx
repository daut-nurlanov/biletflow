import { moment, seatLabel } from './format'
import { Link, useSearchParams } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import type { TicketType } from '../types'
import { useManagedEvent } from './Layout'
import { query, useResource } from './data'
import type { Attendee } from './types'
import { Notice, ResourceState, Status, Table } from './ui'

export default function AttendeesPage() {
  const event = useManagedEvent()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const ticketType = params.get('ticket_type_id') ?? ''
  const resource = useResource<Attendee[]>(
    query(`/api/events/${event.id}/attendees`, {
      q,
      status,
      ticket_type_id: ticketType,
    }),
  )
  const types = useResource<TicketType[]>(
    `/api/events/${event.id}/ticket-types`,
  )
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    for (const name of ['q', 'status', 'ticket_type_id']) {
      const value = String(form.get(name) ?? '').trim()
      if (value) next.set(name, value)
    }
    setParams(next)
  }
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>Посетители</h2>
          <p className="muted">
            Одна строка — один билет. Email относится к покупателю заказа.
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          Обновить
        </button>
      </div>
      <AttendeeFilters
        key={params.toString()}
        q={q}
        status={status}
        ticketType={ticketType}
        types={types.data}
        onSubmit={filter}
        onReset={() => setParams({})}
      />
      {types.error && (
        <Notice error>
          <p>Не удалось загрузить типы билетов: {types.error}</p>
          <button className="btn secondary" onClick={types.refresh}>
            Повторить
          </button>
        </Notice>
      )}
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data && (
        <>
          <p className="muted" role="status">
            Найдено билетов: {resource.data.length}
          </p>
          {resource.data.length === 0 ? (
            <Notice>Посетители не найдены. Попробуйте изменить фильтры.</Notice>
          ) : (
            <Table
              caption="Посетители мероприятия"
              headings={[
                'Посетитель / покупатель',
                'Билет',
                'Место',
                'Статус',
                'Проход (Алматы)',
                'Заказ',
              ]}
            >
              {resource.data.map((attendee) => (
                <tr key={attendee.ticket_id}>
                  <td>
                    <strong>{attendee.attendee_name}</strong>
                    <span className="org-subtext">{attendee.email}</span>
                  </td>
                  <td>
                    {attendee.ticket_type}
                    <span className="org-subtext org-id">
                      {attendee.ticket_id}
                    </span>
                  </td>
                  <td>{seatLabel(attendee)}</td>
                  <td>
                    <Status value={attendee.status} />
                  </td>
                  <td>
                    {attendee.checked_in_at
                      ? moment(attendee.checked_in_at)
                      : '—'}
                  </td>
                  <td>
                    <Link
                      to={`/organizer/events/${event.id}/orders/${attendee.order_id}`}
                    >
                      Открыть заказ
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  )
}

function AttendeeFilters({
  q,
  status,
  ticketType,
  types,
  onSubmit,
  onReset,
}: {
  q: string
  status: string
  ticketType: string
  types?: TicketType[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onReset: () => void
}) {
  const [values, setValues] = useState({ q, status, ticketType })
  return (
    <form className="org-filters" onSubmit={onSubmit}>
      <label className="org-field">
        Имя или email
        <input
          name="q"
          type="search"
          value={values.q}
          onChange={(e) => setValues({ ...values, q: e.target.value })}
          maxLength={254}
          placeholder="Например, Dana"
        />
      </label>
      <label className="org-field">
        Статус билета
        <select
          name="status"
          value={values.status}
          onChange={(e) => setValues({ ...values, status: e.target.value })}
        >
          <option value="">Все статусы</option>
          <option value="valid">Действителен</option>
          <option value="checked_in">Прошёл</option>
          <option value="refunded">Возвращён</option>
          <option value="cancelled">Отменён</option>
        </select>
      </label>
      <label className="org-field">
        Тип билета
        <select
          name="ticket_type_id"
          value={values.ticketType}
          onChange={(e) => setValues({ ...values, ticketType: e.target.value })}
        >
          <option value="">Все типы</option>
          {types?.map((type) => (
            <option value={type.id} key={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" type="submit">
        Применить
      </button>
      <button className="btn secondary" type="button" onClick={onReset}>
        Сбросить
      </button>
    </form>
  )
}
