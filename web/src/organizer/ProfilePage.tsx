import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { messageFor, useResource } from './data'
import { Notice, ResourceState } from './ui'
import { useI18n } from "../i18n"

interface Profile {
  contact_phone: string | null
  payout_account_details: string | null
  paid_sales_verified: boolean
}

function ProfileForm({ data, refresh }: { data: Profile; refresh: () => void }) {
  const { t: localize } = useI18n()
  const [phone, setPhone] = useState(data.contact_phone ?? '')
  const [payout, setPayout] = useState(data.payout_account_details ?? '')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const resource = { refresh }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/organizer/profile', {
        method: 'PUT',
        body: { contact_phone: phone.trim(), payout_account_details: payout.trim() },
      })
      setMessage({ text: 'Profile saved.', error: false })
      resource.refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/organizer/profile/verify', { method: 'POST' })
      setMessage({ text: 'Identity verified (simulated).', error: false })
      resource.refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {message && <Notice error={message.error}>{message.text}</Notice>}
        <>
          <form className="org-panel org-form" onSubmit={save}>
            <label className="org-field">
              {localize("Contact phone")}
              <input required maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="org-field">
              {localize("Payout account (for example IBAN)")}
              <input required maxLength={200} value={payout} onChange={(e) => setPayout(e.target.value)} />
            </label>
            <div className="org-actions">
              <button className="btn" disabled={busy}>
                {localize("Save")}
              </button>
            </div>
          </form>
          <h2>{localize("Identity")}</h2>
          <div className="org-panel">
            {data.paid_sales_verified ? (
              <p>
                <strong>{localize("Verified.")}</strong> {localize("You can activate paid sales on your events.")}
              </p>
            ) : (
              <>
                <p>{localize("Not verified yet. Save both details above, then verify.")}</p>
                <button className="btn" disabled={busy} onClick={verify}>
                  {localize("Verify identity")}
                </button>
              </>
            )}
          </div>
        </>
    </>
  )
}

export default function ProfilePage() {
  const { t: localize } = useI18n()
  const resource = useResource<Profile>('/api/organizer/profile')
  return (
    <>
      <Link className="org-back" to="/organizer">
        {localize("← My events")}
      </Link>
      <div className="org-heading">
        <div>
          <p className="org-eyebrow">{localize("Organizer")}</p>
          <h1>{localize("Profile and verification")}</h1>
          <p className="muted">
            {localize("Needed before you can sell paid tickets. Verification is simulated in this version: it checks that both details are filled in.")}
          </p>
        </div>
      </div>
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data && (
        <ProfileForm data={resource.data} refresh={resource.refresh} />
      )}
    </>
  )
}
