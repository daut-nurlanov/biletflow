import { useState, type FormEvent } from 'react'
import { api, BASE, getToken } from '../api'
import { messageFor, useResource } from '../organizer/data'
import { money } from '../organizer/format'
import { Notice, ResourceState, Stat } from '../organizer/ui'
import { useI18n } from "../i18n"

interface Summary {
  users: number
  organizers: number
  events: number
  events_on_sale: number
  paid_orders: number
  net_sales: number
  refunded: number
  tickets_issued: number
  tickets_checked_in: number
  open_support_cases: number
  escalated_cases: number
  open_event_reports: number
  activation_fees: number
}

function SettingsForm({
  initial,
  refresh,
}: {
  initial: Record<string, string>
  refresh: () => void
}) {
  const { t: localize } = useI18n()
  const [fee, setFee] = useState(initial.activation_fee ?? '')
  const [rate, setRate] = useState(initial.processing_fee_rate ?? '')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { activation_fee: Number(fee), processing_fee_rate: Number(rate) },
      })
      setMessage({ text: 'Settings saved.', error: false })
      refresh()
    } catch (err) {
      setMessage({ text: messageFor(err), error: true })
    }
  }
  return (
    <form className="org-panel org-form" onSubmit={save}>
      {message && <Notice error={message.error}>{message.text}</Notice>}
      <div className="org-form-row">
        <label className="org-field">
          {localize("Activation fee (KZT, once per paid event)")}
          <input required type="number" min={0} step="any" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label className="org-field">
          {localize("Processing fee rate (0.03 = 3%)")}
          <input required type="number" min={0} max={1} step="any" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
      </div>
      <div className="org-actions">
        <button className="btn">{localize("Save settings")}</button>
      </div>
    </form>
  )
}

export default function Overview() {
  const { t: localize } = useI18n()
  const summary = useResource<Summary>('/api/admin/reports/summary')
  const settings = useResource<Record<string, string>>('/api/admin/settings')
  const [error, setError] = useState('')

  async function download() {
    setError('')
    try {
      const res = await fetch(`${BASE}/api/admin/reports/orders.csv`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error('The export failed. Try again.')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'orders.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(messageFor(err))
    }
  }

  const s = summary.data
  return (
    <>
      <ResourceState {...summary} retry={summary.refresh} />
      {s && (
        <div className="org-stats">
          <Stat title={localize("Users")} value={`${s.users} (${s.organizers} organizers)`} />
          <Stat title={localize("Events")} value={`${s.events} (${s.events_on_sale} on sale)`} />
          <Stat title={localize("Paid orders")} value={s.paid_orders} />
          <Stat title={localize("Net sales")} value={money(s.net_sales)} />
          <Stat title={localize("Refunded")} value={money(s.refunded)} />
          <Stat title={localize("Tickets issued")} value={`${s.tickets_issued} (${s.tickets_checked_in} checked in)`} />
          <Stat title={localize("Open support cases")} value={`${s.open_support_cases} (${s.escalated_cases} escalated)`} />
          <Stat title={localize("Open event reports")} value={s.open_event_reports} />
          <Stat title={localize("Activation fees")} value={money(s.activation_fees)} />
        </div>
      )}
      <h2>{localize("Export")}</h2>
      {error && <Notice error>{error}</Notice>}
      <p>
        <button className="btn secondary" onClick={download}>
          {localize("Download all orders (CSV)")}
        </button>
      </p>
      <h2>{localize("Platform settings")}</h2>
      <ResourceState {...settings} retry={settings.refresh} />
      {settings.data && (
        <SettingsForm initial={settings.data} refresh={settings.refresh} />
      )}
    </>
  )
}
