import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { messageFor, useResource } from './data'
import { Notice, ResourceState } from './ui'
import { toApiTime, toLocalInput, type FullEvent } from './setup'

const CATEGORIES = ['Concert', 'Conference', 'Workshop', 'Sports', 'Festival', 'Theatre', 'Other']

interface FormState {
  title: string
  venue_name: string
  venue_address: string
  category: string
  description: string
  start: string
  end: string
  capacity: string
  visibility: string
  refund_policy: string
  image_url: string
  reg_opens: string
  reg_closes: string
}

const EMPTY: FormState = {
  title: '',
  venue_name: '',
  venue_address: '',
  category: 'Concert',
  description: '',
  start: '',
  end: '',
  capacity: '100',
  visibility: 'public',
  refund_policy: '',
  image_url: '',
  reg_opens: '',
  reg_closes: '',
}

function fromEvent(event: FullEvent): FormState {
  return {
    title: event.title,
    venue_name: event.venue_name,
    venue_address: event.venue_address ?? '',
    category: event.category ?? 'Other',
    description: event.description ?? '',
    start: toLocalInput(event.start_time),
    end: toLocalInput(event.end_time),
    capacity: String(event.capacity),
    visibility: event.visibility,
    refund_policy: event.refund_policy ?? '',
    image_url: event.image_url ?? '',
    reg_opens: toLocalInput(event.registration_opens_at),
    reg_closes: toLocalInput(event.registration_closes_at),
  }
}

function EventForm({
  initial,
  eventId,
}: {
  initial: FormState
  eventId?: string
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const capacity = Number(form.capacity)
    if (!Number.isInteger(capacity) || capacity < 1) {
      setError('Capacity must be a whole number of at least 1.')
      return
    }
    // Empty optional fields are left out. The server keeps the old value
    // when a field is missing, so a field cannot be cleared once it is set.
    const body = {
      title: form.title.trim(),
      venue_name: form.venue_name.trim(),
      venue_address: form.venue_address.trim() || undefined,
      category: form.category || undefined,
      description: form.description.trim() || undefined,
      start_time: toApiTime(form.start),
      end_time: toApiTime(form.end),
      capacity,
      visibility: form.visibility,
      refund_policy: form.refund_policy.trim() || undefined,
      image_url: form.image_url.trim() || undefined,
      registration_opens_at: toApiTime(form.reg_opens),
      registration_closes_at: toApiTime(form.reg_closes),
    }
    setBusy(true)
    try {
      if (eventId) {
        await api(`/api/events/${eventId}`, { method: 'PUT', body })
        navigate(`/organizer/events/${eventId}/setup`)
      } else {
        const created = await api<{ id: string }>('/api/events', {
          method: 'POST',
          body,
        })
        navigate(`/organizer/events/${created.id}/setup`)
      }
    } catch (err) {
      setError(messageFor(err))
      setBusy(false)
    }
  }

  return (
    <form className="org-panel org-form" onSubmit={submit}>
      {error && <Notice error>{error}</Notice>}
      <label className="org-field">
        Title
        <input required maxLength={200} value={form.title} onChange={set('title')} />
      </label>
      <div className="org-form-row">
        <label className="org-field">
          Venue name
          <input required maxLength={200} value={form.venue_name} onChange={set('venue_name')} />
        </label>
        <label className="org-field">
          Venue address
          <input maxLength={300} value={form.venue_address} onChange={set('venue_address')} />
        </label>
      </div>
      <div className="org-form-row">
        <label className="org-field">
          Starts (Almaty time)
          <input required type="datetime-local" value={form.start} onChange={set('start')} />
        </label>
        <label className="org-field">
          Ends (Almaty time)
          <input type="datetime-local" value={form.end} onChange={set('end')} />
        </label>
      </div>
      <div className="org-form-row">
        <label className="org-field">
          Category
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="org-field">
          Capacity (total tickets)
          <input required type="number" min={1} value={form.capacity} onChange={set('capacity')} />
        </label>
        <label className="org-field">
          Who can see it
          <select value={form.visibility} onChange={set('visibility')}>
            <option value="public">Public: listed for everyone</option>
            <option value="unlisted">Unlisted: only with the link</option>
            <option value="private">Private: not for sale</option>
          </select>
        </label>
      </div>
      <label className="org-field">
        Description
        <textarea rows={4} maxLength={5000} value={form.description} onChange={set('description')} />
      </label>
      <label className="org-field">
        Refund policy
        <textarea rows={2} maxLength={2000} value={form.refund_policy} onChange={set('refund_policy')} />
      </label>
      <label className="org-field">
        Image address (https://...)
        <input type="url" maxLength={500} value={form.image_url} onChange={set('image_url')} />
      </label>
      <div className="org-form-row">
        <label className="org-field">
          Registration opens (optional)
          <input type="datetime-local" value={form.reg_opens} onChange={set('reg_opens')} />
        </label>
        <label className="org-field">
          Registration closes (optional)
          <input type="datetime-local" value={form.reg_closes} onChange={set('reg_closes')} />
        </label>
      </div>
      <div className="org-actions">
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : eventId ? 'Save changes' : 'Create draft event'}
        </button>
        <Link className="btn secondary" to={eventId ? `/organizer/events/${eventId}/setup` : '/organizer'}>
          Cancel
        </Link>
      </div>
    </form>
  )
}

export function NewEventPage() {
  return (
    <>
      <Link className="org-back" to="/organizer">
        ← My events
      </Link>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Set-up</p>
          <h1>New event</h1>
          <p className="muted">
            The event is saved as a draft. Add ticket types, then publish it.
          </p>
        </div>
      </div>
      <EventForm initial={EMPTY} />
    </>
  )
}

export function EditEventPage() {
  const { eventId } = useParams()
  const resource = useResource<FullEvent>(`/api/events/${eventId}`)
  return (
    <>
      <Link className="org-back" to={`/organizer/events/${eventId}/setup`}>
        ← Set-up
      </Link>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">Set-up</p>
          <h1>Edit event</h1>
        </div>
      </div>
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data && (
        <EventForm initial={fromEvent(resource.data)} eventId={eventId} />
      )}
    </>
  )
}
