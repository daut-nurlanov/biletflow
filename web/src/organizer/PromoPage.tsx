import { useEffect, useState, type FormEvent } from 'react'
import { api, BASE, getToken } from '../api'
import { messageFor, useResource } from './data'
import { useManagedEvent } from './Layout'
import { toApiTime, type Campaign, type TicketType } from './setup'
import { Notice, ResourceState, Table } from './ui'
import { useI18n } from "../i18n"

// The campaign QR needs the organizer's sign-in, so it is fetched with the
// token and shown from a local blob instead of a plain <img src>.
function CampaignQr({ id, code }: { id: string; code: string }) {
  const { t: localize } = useI18n()
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
  if (failed) return <p className="muted">{localize("QR could not be loaded.")}</p>
  if (!url) return <p className="muted">{localize("Loading QR…")}</p>
  return (
    <figure className="org-qr">
      <img src={url} alt={`Campaign QR for ${code}`} />
      <figcaption>
        <a href={url} download={`promo-${code}.png`}>
          {localize("Download QR")}
        </a>
      </figcaption>
    </figure>
  )
}

export default function PromoPage() {
  const { t: localize } = useI18n()
  const event = useManagedEvent()
  const list = useResource<Campaign[]>(`/api/events/${event.id}/promo-campaigns`)
  const types = useResource<TicketType[]>(`/api/events/${event.id}/ticket-types`)
  const [picked, setPicked] = useState<string[]>([])
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
          // empty means the code works for every ticket type
          ticket_type_ids: picked.length > 0 ? picked : undefined,
        },
      })
      setMessage({ text: `Campaign ${made.code} created.`, error: false })
      setCode('')
      setPicked([])
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
        {localize("A campaign gives buyers a discount through a code or a QR link. The server always calculates the discount, so a link can never change a price.")}
      </p>
      {message && <Notice error={message.error}>{message.text}</Notice>}

      <form className="org-panel org-form" onSubmit={create}>
        <h3>{localize("New campaign")}</h3>
        <div className="org-form-row">
          <label className="org-field">
            {localize("Code (leave empty to generate)")}
            <input maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="org-field">
            {localize("Discount type")}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percentage">{localize("Percentage (%)")}</option>
              <option value="fixed">{localize("Fixed amount (KZT)")}</option>
            </select>
          </label>
          <label className="org-field">
            {localize("Discount")}
            <input required type="number" min={1} step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="org-field">
            {localize("Max uses")}
            <input required type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <div className="org-form-row">
          <label className="org-field">
            {localize("Valid from (optional)")}
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="org-field">
            {localize("Valid until (optional)")}
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
        {types.data && types.data.length > 0 && (
          <fieldset className="org-field">
            <legend>{localize("Applies to (leave all unchecked for every ticket type)")}</legend>
            {types.data.map((t) => (
              <label key={t.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={picked.includes(t.id)}
                  onChange={(e) =>
                    setPicked(e.target.checked ? [...picked, t.id] : picked.filter((id) => id !== t.id))
                  }
                />{' '}
                {t.name}
              </label>
            ))}
          </fieldset>
        )}
        <div className="org-actions">
          <button className="btn" disabled={busy}>
            {busy ? localize("Creating…") : localize("Create campaign")}
          </button>
        </div>
      </form>

      <h2>{localize("Campaigns")}</h2>
      <ResourceState {...list} retry={list.refresh} />
      {list.data?.length === 0 && <Notice>{localize("No campaigns yet.")}</Notice>}
      {list.data && list.data.length > 0 && (
        <Table caption={localize("Promo campaigns")} headings={['Code', 'Discount', 'Used', 'Status', 'Link and QR']}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>
                {c.discount_type === 'percentage'
                  ? `${Number(c.discount_value)}%`
                  : `${Number(c.discount_value)} KZT`}
                <div className="muted">
                  {c.ticket_type_ids && c.ticket_type_ids.length > 0
                    ? `Only: ${c.ticket_type_ids
                        .map((id) => types.data?.find((t) => t.id === id)?.name ?? 'a ticket type')
                        .join(', ')}`
                    : localize("All ticket types")}
                </div>
              </td>
              <td>
                {c.redemptions_count ?? 0} / {c.max_redemptions}
              </td>
              <td>
                {c.is_active ? localize("Active") : localize("Disabled")}{' '}
                <button className="btn secondary" onClick={() => toggle(c)}>
                  {c.is_active ? localize("Disable") : localize("Enable")}
                </button>
              </td>
              <td>
                <button className="btn secondary" onClick={() => setShown(shown === c.id ? '' : c.id)}>
                  {shown === c.id ? localize("Hide QR") : localize("Show QR")}
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
