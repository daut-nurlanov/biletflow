import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useManagedEvent } from './Layout'
import { messageFor, useResource } from './data'
import type { StaffMember } from './types'
import { Notice, ResourceState, Status, Table } from './ui'

function staffError(error: unknown) {
  if (
    error instanceof ApiError &&
    error.message.startsWith('No door-staff account found')
  )
    return error.message
  return messageFor(error)
}

export default function StaffPage() {
  const event = useManagedEvent()
  return (
    <StaffManager key={event.id} eventId={event.id} eventTitle={event.title} />
  )
}

function StaffManager({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const resource = useResource<StaffMember[]>(`/api/events/${eventId}/staff`)
  const [mode, setMode] = useState<'assign' | 'create'>('assign')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirming, setConfirming] = useState<StaffMember | null>(null)
  const inFlight = useRef(false)
  const disabled = busy || !resource.data || Boolean(confirming)

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || disabled) return
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') ?? '').trim()
    const fullName = String(values.get('full_name') ?? '').trim()
    const password = String(values.get('password') ?? '')
    setError('')
    setSuccess('')
    if (mode === 'create') {
      if (!fullName || [...fullName].length > 120) {
        setError('Enter a name of at most 120 characters.')
        return
      }
      if (
        [...password].length < 8 ||
        new TextEncoder().encode(password).length > 72
      ) {
        setError(
          'Use a password of at least 8 characters and at most 72 UTF-8 bytes.',
        )
        return
      }
      if (password !== values.get('confirm_password')) {
        setError('The passwords do not match.')
        return
      }
    }
    inFlight.current = true
    setBusy(true)
    try {
      const result = await api<{ already_assigned: boolean }>(
        `/api/events/${eventId}/staff`,
        {
          method: 'POST',
          body: {
            email,
            mode,
            ...(mode === 'create' ? { full_name: fullName, password } : {}),
          },
        },
      )
      form.reset()
      setSuccess(
        result.already_assigned
          ? 'This staff member already has access to this event.'
          : mode === 'create'
            ? 'Staff account created and assigned. Share the sign-in details directly with the staff member.'
            : 'Staff member assigned to this event.',
      )
      resource.refresh()
    } catch (error) {
      setError(staffError(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function changeAccess(staff: StaffMember, revoke: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api(`/api/events/${eventId}/staff${revoke ? `/${staff.id}` : ''}`, {
        method: revoke ? 'DELETE' : 'POST',
        ...(revoke ? {} : { body: { email: staff.email, mode: 'assign' } }),
      })
      setConfirming(null)
      setSuccess(
        revoke
          ? `Access to this event revoked for ${staff.full_name}.`
          : `Access to this event restored for ${staff.full_name}.`,
      )
      resource.refresh()
    } catch (error) {
      setError(staffError(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function refresh() {
    setConfirming(null)
    setError('')
    resource.refresh()
  }
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>Staff</h2>
          <p className="muted">
            Assign door staff who can verify tickets for this event in the
            mobile app.
          </p>
        </div>
        <button className="btn secondary" disabled={busy} onClick={refresh}>
          Refresh staff
        </button>
      </div>
      {success && <Notice>{success}</Notice>}
      {error && (
        <Notice error>
          <p>{error}</p>
          <p>
            If the response was lost, refresh the staff list before trying
            again.
          </p>
        </Notice>
      )}
      <section className="org-panel" aria-labelledby="assign-staff-title">
        <h3 id="assign-staff-title">Assign staff</h3>
        <fieldset className="org-staff-modes" disabled={disabled}>
          <legend>Account</legend>
          <label>
            <input
              type="radio"
              name="staff-mode"
              value="assign"
              checked={mode === 'assign'}
              onChange={() => {
                setMode('assign')
                setError('')
              }}
            />{' '}
            Assign existing staff
          </label>
          <label>
            <input
              type="radio"
              name="staff-mode"
              value="create"
              checked={mode === 'create'}
              onChange={() => {
                setMode('create')
                setError('')
              }}
            />{' '}
            Create new staff account
          </label>
        </fieldset>
        <form key={mode} className="org-staff-form" onSubmit={assign}>
          <fieldset disabled={disabled}>
            <legend className="org-sr-only">Staff details</legend>
            <label className="org-field">
              Staff email
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                maxLength={254}
              />
            </label>
            {mode === 'create' && (
              <>
                <label className="org-field">
                  Full name
                  <input name="full_name" required autoComplete="off" />
                </label>
                <label className="org-field">
                  Initial password
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                  />
                </label>
                <label className="org-field">
                  Confirm initial password
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                  />
                </label>
                <p className="muted">
                  Use at least 8 characters (at most 72 UTF-8 bytes). Share the
                  email and initial password directly with the staff member. No
                  invitation email is sent.
                </p>
              </>
            )}
            {mode === 'assign' && (
              <p className="muted">
                Only existing door-staff accounts can be assigned. This does not
                change their password or permissions at other events.
              </p>
            )}
            <button className="btn" type="submit">
              {busy
                ? 'Saving…'
                : mode === 'create'
                  ? 'Create and assign'
                  : 'Assign staff'}
            </button>
          </fieldset>
        </form>
      </section>
      {confirming && (
        <section
          className="org-panel org-confirm"
          aria-labelledby="revoke-staff-title"
        >
          <h3 id="revoke-staff-title">Revoke event access?</h3>
          <p>
            <strong>{confirming.full_name}</strong> ({confirming.email}) will
            lose access to <strong>{eventTitle}</strong>. Their account and
            other event assignments remain.
          </p>
          <div className="org-actions">
            <button
              className="btn org-danger"
              disabled={busy}
              onClick={() => void changeAccess(confirming, true)}
            >
              {busy ? 'Revoking…' : 'Confirm revoke'}
            </button>
            <button
              className="btn secondary"
              autoFocus
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <ResourceState {...resource} retry={refresh} />
      {resource.data && (
        <>
          <h3>Event staff</h3>
          <p className="muted" role="status">
            {
              resource.data.filter(
                (staff) => staff.status === 'active' && !staff.is_suspended,
              ).length
            }{' '}
            active staff · {resource.data.length} total assignments
          </p>
          {resource.data.length === 0 ? (
            <Notice>
              No staff assigned yet. Assign an existing staff account or create
              a new one above.
            </Notice>
          ) : (
            <Table
              caption="Event staff"
              headings={['Staff member', 'Event access', 'Account', 'Actions']}
            >
              {resource.data.map((staff) => (
                <tr key={staff.id}>
                  <td>
                    <strong>{staff.full_name}</strong>
                    <span className="org-subtext">{staff.email}</span>
                  </td>
                  <td>
                    <Status value={staff.status} />
                  </td>
                  <td>
                    {staff.is_suspended
                      ? 'Suspended — cannot sign in'
                      : 'Available'}
                  </td>
                  <td>
                    {staff.status === 'active' ? (
                      <button
                        className="btn secondary"
                        disabled={busy || Boolean(confirming)}
                        onClick={() => {
                          setConfirming(staff)
                          setError('')
                          setSuccess('')
                        }}
                      >
                        Revoke access
                      </button>
                    ) : (
                      <button
                        className="btn secondary"
                        disabled={
                          busy || Boolean(confirming) || staff.is_suspended
                        }
                        onClick={() => void changeAccess(staff, false)}
                      >
                        Restore access
                      </button>
                    )}
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
