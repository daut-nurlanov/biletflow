import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { messageFor, useResource } from './data'
import { money } from './format'
import { useManagedEvent } from './Layout'
import { toApiTime, toLocalInput, type TicketType } from './setup'
import { Notice, ResourceState, Table } from './ui'

interface Checklist {
  activation_fee: string | number
  items: { key: string; label: string; done: boolean }[]
  paid_sales_active: boolean
  suspended_by_admin: boolean
}

interface TypeForm {
  name: string
  price: string
  total_quantity: string
  max_per_order: string
  description: string
  sales_start: string
  sales_end: string
  is_hidden: boolean
}

const BLANK: TypeForm = {
  name: '',
  price: '0',
  total_quantity: '50',
  max_per_order: '10',
  description: '',
  sales_start: '',
  sales_end: '',
  is_hidden: false,
}

function TicketTypeForm({
  eventId,
  editing,
  onDone,
}: {
  eventId: string
  editing?: TicketType
  onDone: () => void
}) {
  const [form, setForm] = useState<TypeForm>(
    editing
      ? {
          name: editing.name,
          price: String(Number(editing.price)),
          total_quantity: String(editing.total_quantity),
          max_per_order: String(editing.max_per_order),
          description: editing.description ?? '',
          sales_start: toLocalInput(editing.sales_start_time),
          sales_end: toLocalInput(editing.sales_end_time),
          is_hidden: editing.is_hidden,
        }
      : BLANK,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      name: form.name.trim(),
      price: Number(form.price),
      total_quantity: Number(form.total_quantity),
      max_per_order: Number(form.max_per_order),
      description: form.description.trim() || undefined,
      sales_start_time: toApiTime(form.sales_start),
      sales_end_time: toApiTime(form.sales_end),
      is_hidden: form.is_hidden,
    }
    if (!Number.isFinite(body.price) || body.price < 0) {
      setError('Price must be 0 or more (0 makes the ticket free).')
      return
    }
    setBusy(true)
    try {
      if (editing)
        await api(`/api/ticket-types/${editing.id}`, { method: 'PUT', body })
      else
        await api(`/api/events/${eventId}/ticket-types`, {
          method: 'POST',
          body,
        })
      onDone()
    } catch (err) {
      setError(messageFor(err))
      setBusy(false)
    }
  }

  return (
    <form className="org-panel org-form" onSubmit={submit}>
      <h3>{editing ? `Edit ${editing.name}` : 'Add a ticket type'}</h3>
      {error && <Notice error>{error}</Notice>}
      <div className="org-form-row">
        <label className="org-field">
          Name
          <input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="org-field">
          Price (KZT, 0 = free)
          <input required type="number" min={0} step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </label>
        <label className="org-field">
          Tickets available
          <input required type="number" min={1} value={form.total_quantity} onChange={(e) => setForm({ ...form, total_quantity: e.target.value })} />
        </label>
        <label className="org-field">
          Max per order
          <input required type="number" min={1} value={form.max_per_order} onChange={(e) => setForm({ ...form, max_per_order: e.target.value })} />
        </label>
      </div>
      <label className="org-field">
        Description
        <input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <div className="org-form-row">
        <label className="org-field">
          Sales start (optional)
          <input type="datetime-local" value={form.sales_start} onChange={(e) => setForm({ ...form, sales_start: e.target.value })} />
        </label>
        <label className="org-field">
          Sales end (optional)
          <input type="datetime-local" value={form.sales_end} onChange={(e) => setForm({ ...form, sales_end: e.target.value })} />
        </label>
      </div>
      <label className="org-check">
        <input type="checkbox" checked={form.is_hidden} onChange={(e) => setForm({ ...form, is_hidden: e.target.checked })} />
        Hide from buyers (for example a staff or guest list type)
      </label>
      <div className="org-actions">
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save ticket type'}
        </button>
        <button type="button" className="btn secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function SetupPage() {
  const event = useManagedEvent()
  const types = useResource<TicketType[]>(`/api/events/${event.id}/ticket-types`)
  const checklist = useResource<Checklist>(
    `/api/events/${event.id}/activation-checklist`,
  )
  const [editing, setEditing] = useState<TicketType | 'new' | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const refreshAll = () => {
    types.refresh()
    checklist.refresh()
    event.refresh()
  }

  async function run(label: string, path: string, body?: unknown) {
    setBusy(true)
    setMessage(null)
    try {
      await api(path, { method: 'POST', body })
      setMessage({ text: label, error: false })
      refreshAll()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  const draft = event.phase === 'draft'
  const live = event.phase === 'upcoming' || event.phase === 'active'
  const editable = event.phase !== 'cancelled' && event.phase !== 'completed'
  const hasPaid = (types.data ?? []).some((t) => Number(t.price) > 0)

  return (
    <>
      {message && <Notice error={message.error}>{message.text}</Notice>}

      <h2>Event status</h2>
      <div className="org-panel">
        <p>
          This event is <strong>{event.phase}</strong>.
          {draft && ' Buyers cannot see it until you publish it.'}
        </p>
        <div className="org-actions">
          {editable && (
            <Link className="btn secondary" to={`/organizer/events/${event.id}/edit`}>
              Edit details
            </Link>
          )}
          {draft && (
            <button className="btn" disabled={busy} onClick={() => run('Event published. Buyers can now see it.', `/api/events/${event.id}/publish`)}>
              Publish event
            </button>
          )}
          {live && (
            <button className="btn secondary" disabled={busy} onClick={() => run('Event moved back to draft.', `/api/events/${event.id}/unpublish`)}>
              Unpublish (only if nothing is sold)
            </button>
          )}
          <button className="btn secondary" disabled={busy} onClick={() => run('A copy was created as a draft. Find it in My events.', `/api/events/${event.id}/duplicate`)}>
            Duplicate as draft
          </button>
          {editable && !confirmCancel && (
            <button className="btn org-danger" onClick={() => setConfirmCancel(true)}>
              Cancel event
            </button>
          )}
        </div>
        {confirmCancel && (
          <div className="org-confirm" role="alertdialog" aria-label="Confirm cancel">
            <p>
              Cancelling stops all ticket sales and every ticket stops working at
              the door. Ticket holders are notified. This cannot be undone.
            </p>
            <button className="btn org-danger" disabled={busy} onClick={() => run('Event cancelled. Ticket holders were notified. Refund orders from the Orders tab.', `/api/events/${event.id}/cancel`)}>
              Yes, cancel this event
            </button>{' '}
            <button className="btn secondary" onClick={() => setConfirmCancel(false)}>
              Keep event
            </button>
          </div>
        )}
      </div>

      <h2>Ticket types</h2>
      <ResourceState {...types} retry={types.refresh} />
      {types.data?.length === 0 && (
        <Notice>No ticket types yet. Add one so the event can be published.</Notice>
      )}
      {types.data && types.data.length > 0 && (
        <Table caption="Ticket types" headings={['Name', 'Price', 'Sold', 'Per order', 'Visible', '']}>
          {types.data.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{Number(t.price) > 0 ? money(t.price) : 'Free'}</td>
              <td>
                {t.total_quantity - t.quantity_available} / {t.total_quantity}
              </td>
              <td>{t.max_per_order}</td>
              <td>{t.is_hidden ? 'Hidden' : 'Yes'}</td>
              <td>
                {editable && (
                  <button className="btn secondary" onClick={() => {
                      setMessage(null)
                      setEditing(t)
                    }}>
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editable && !editing && (
        <p>
          <button className="btn" onClick={() => {
              setMessage(null)
              setEditing('new')
            }}>
            Add ticket type
          </button>
        </p>
      )}
      {editing && (
        <TicketTypeForm
          key={editing === 'new' ? 'new' : editing.id}
          eventId={event.id}
          editing={editing === 'new' ? undefined : editing}
          onDone={() => {
            setEditing(null)
            refreshAll()
          }}
        />
      )}

      {hasPaid && checklist.data && (
        <>
          <h2>Paid ticket sales</h2>
          <div className="org-panel">
            {checklist.data.paid_sales_active ? (
              <p>
                <strong>Paid sales are active.</strong> Buyers can pay for paid
                ticket types.
              </p>
            ) : (
              <>
                <p>
                  Selling paid tickets needs a one-time activation (fee{' '}
                  {money(checklist.data.activation_fee)}, simulated, no real money
                  moves).
                </p>
                <ul className="org-checklist">
                  {checklist.data.items.map((item) => (
                    <li key={item.key}>
                      {item.done ? '✔' : '○'} {item.label}
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  Identity and payout details are on your{' '}
                  <Link to="/organizer/profile">organizer profile</Link>.
                </p>
                {checklist.data.suspended_by_admin ? (
                  <Notice error>Paid sales were suspended by BiletFlow.</Notice>
                ) : (
                  <>
                    <label className="org-check">
                      <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                      I accept the paid-event terms
                    </label>
                    <p>
                      <button className="btn" disabled={busy || !terms} onClick={() => run('Paid sales activated.', `/api/events/${event.id}/activate-paid`, { accept_terms: terms })}>
                        Pay activation fee and activate
                      </button>
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
