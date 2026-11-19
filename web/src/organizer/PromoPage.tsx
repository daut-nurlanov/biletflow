import { useEffect, useState, type FormEvent } from 'react'
import { api, BASE, getToken } from '../api'
import { messageFor, useResource } from './data'
import { useManagedEvent } from './Layout'
import { toApiTime, type Campaign } from './setup'
import { Notice, ResourceState, Table } from './ui'

// The campaign QR needs the organizer's sign-in, so it is fetched with the
// token and shown from a local blob instead of a plain <img src>.
function CampaignQr({ id, code }: { id: string; code: string }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    fetch(`${BASE}/api/promo-campaigns/${id}/qr.png`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('bad'))))
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  if (failed) return <p className="muted">QR could not be loaded.</p>
  if (!url) return <p className="muted">Loading QR…</p>
  return (
    <figure className="org-qr">
      <img src={url} alt={`Campaign QR for ${code}`} />
      <figcaption>
        <a href={url} download={`promo-${code}.png`}>
          Download QR
        </a>
      </figcaption>
    </figure>
  )
}

export default function PromoPage() {
  const event = useManagedEvent()
  const list = useResource<Campaign[]>(`/api/events/${event.id}/promo-campaigns`)
  const [code, setCode] = useState('')
  const [type, setType] = useState('percentage')
  const [value, setValue] = useState('10')
  const [max, setMax] = useState('50')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState('')

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const made = await api<Campaign>(`/api/events/${event.id}/promo-campaigns`, {
        method: 'POST',
        body: {
          code: code.trim() || undefined,
          discount_type: type,
          discount_value: Number(value),
          max_redemptions: Number(max),
          valid_from: toApiTime(from),
          valid_until: toApiTime(until),
        },
      })
      setMessage({ text: `Campaign ${made.code} created.`, error: false })
      setCode('')
      setShown(made.id)
      list.refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function toggle(c: Campaign) {
    setMessage(null)
    try {
      await api(`/api/promo-campaigns/${c.id}/${c.is_active ? 'disable' : 'enable'}`, {
        method: 'POST',
      })
      list.refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    }
  }

  return (
    <>
      <p className="muted">
        A campaign gives buyers a discount through a code or a QR link. The
        server always calculates the discount, so a link can never change a price.
      </p>
      {message && <Notice error={message.error}>{message.text}</Notice>}

      <form className="org-panel org-form" onSubmit={create}>
        <h3>New campaign</h3>
        <div className="org-form-row">
          <label className="org-field">
            Code (leave empty to generate)
            <input maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="org-field">
            Discount type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount (KZT)</option>
            </select>
          </label>
          <label className="org-field">
            Discount
            <input required type="number" min={1} step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="org-field">
            Max uses
            <input required type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <div className="org-form-row">
          <label className="org-field">
            Valid from (optional)
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="org-field">
            Valid until (optional)
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
        <div className="org-actions">
          <button className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </form>

      <h2>Campaigns</h2>
      <ResourceState {...list} retry={list.refresh} />
      {list.data?.length === 0 && <Notice>No campaigns yet.</Notice>}
      {list.data && list.data.length > 0 && (
        <Table caption="Promo campaigns" headings={['Code', 'Discount', 'Used', 'Status', 'Link and QR']}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>
                {c.discount_type === 'percentage'
                  ? `${Number(c.discount_value)}%`
                  : `${Number(c.discount_value)} KZT`}
              </td>
              <td>
                {c.redemptions_count ?? 0} / {c.max_redemptions}
              </td>
              <td>
                {c.is_active ? 'Active' : 'Disabled'}{' '}
                <button className="btn secondary" onClick={() => toggle(c)}>
                  {c.is_active ? 'Disable' : 'Enable'}
                </button>
              </td>
              <td>
                <button className="btn secondary" onClick={() => setShown(shown === c.id ? '' : c.id)}>
                  {shown === c.id ? 'Hide QR' : 'Show QR'}
                </button>
                {shown === c.id && (
                  <>
                    <p className="org-id">{c.campaign_link}</p>
                    <CampaignQr id={c.id} code={c.code} />
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
