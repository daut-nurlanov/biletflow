import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useResource } from '../organizer/data'
import { money, moment } from '../organizer/format'
import { Notice, ResourceState, Table } from '../organizer/ui'
import { useAction } from './actions'
import { Banner } from './helpers'
import { useI18n } from "../i18n"

interface Report {
  id: string
  event_id: string
  event_title: string
  event_status: string
  reason: string
  status: string
  created_at: string
}
interface Promo {
  id: string
  code: string
  is_active: boolean
  discount_type: string
  discount_value: number
  redemptions_count: number
  max_redemptions: number
  event_title: string
  organizer_email: string
}

export function Moderation() {
  const { t: localize } = useI18n()
  const [status, setStatus] = useState('open')
  const reports = useResource<Report[]>(
    `/api/admin/event-reports${status ? `?status=${status}` : '?status='}`,
  )
  const promos = useResource<Promo[]>('/api/admin/promo-activity')
  const { run, busy, banner } = useAction(reports.refresh)
  return (
    <>
      <h2>{localize("Event reports")}</h2>
      <div className="org-filters">
        <label className="org-field">
          {localize("Show")}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">{localize("Open")}</option>
            <option value="actioned">{localize("Actioned")}</option>
            <option value="dismissed">{localize("Dismissed")}</option>
          </select>
        </label>
      </div>
      <Banner message={banner} />
      <ResourceState {...reports} retry={reports.refresh} />
      {reports.data?.length === 0 && <Notice>{localize("No reports here.")}</Notice>}
      {reports.data && reports.data.length > 0 && (
        <Table caption={localize("Event reports")} headings={['Event', 'Reason', 'Reported', 'Status', '']}>
          {reports.data.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`/events/${r.event_id}`}>{r.event_title}</Link> ({r.event_status})
              </td>
              <td>{r.reason}</td>
              <td>{moment(r.created_at)}</td>
              <td>{r.status}</td>
              <td className="org-actions">
                {r.status === 'open' && (
                  <>
                    <button className="btn secondary" disabled={busy} onClick={() => run('Report dismissed.', `/api/admin/event-reports/${r.id}`, 'PUT', { status: 'dismissed' })}>
                      {localize("Dismiss")}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => run('Marked as actioned. Suspend the event from the Events tab if needed.', `/api/admin/event-reports/${r.id}`, 'PUT', { status: 'actioned' })}>
                      {localize("Mark actioned")}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <h2>{localize("Promo activity")}</h2>
      <ResourceState {...promos} retry={promos.refresh} />
      {promos.data?.length === 0 && <Notice>{localize("No promo campaigns yet.")}</Notice>}
      {promos.data && promos.data.length > 0 && (
        <Table caption={localize("Promo campaigns")} headings={['Code', 'Event', 'Organizer', 'Discount', 'Used', 'Status']}>
          {promos.data.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td>{p.event_title}</td>
              <td>{p.organizer_email}</td>
              <td>{p.discount_type === 'percentage' ? `${Number(p.discount_value)}%` : money(p.discount_value)}</td>
              <td>
                {p.redemptions_count} / {p.max_redemptions}
              </td>
              <td>{p.is_active ? localize("Active") : localize("Disabled")}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

interface Activation {
  id: string
  event_title: string
  organizer_email: string
  fee_amount: number
  fee_reference: string
  created_at: string
}
interface Refund {
  id: string
  event_title: string
  attendee_email: string
  amount: number
  reason: string | null
  created_at: string
}

export function Money() {
  const { t: localize } = useI18n()
  const activations = useResource<Activation[]>('/api/admin/activations')
  const refunds = useResource<Refund[]>('/api/admin/refunds')
  return (
    <>
      <h2>{localize("Paid-sales activations")}</h2>
      <ResourceState {...activations} retry={activations.refresh} />
      {activations.data?.length === 0 && <Notice>{localize("No activations yet.")}</Notice>}
      {activations.data && activations.data.length > 0 && (
        <Table caption={localize("Activations")} headings={['When', 'Event', 'Organizer', 'Fee', 'Reference']}>
          {activations.data.map((a) => (
            <tr key={a.id}>
              <td>{moment(a.created_at)}</td>
              <td>{a.event_title}</td>
              <td>{a.organizer_email}</td>
              <td>{money(a.fee_amount)}</td>
              <td className="org-id">{a.fee_reference}</td>
            </tr>
          ))}
        </Table>
      )}
      <h2>{localize("Refunds")}</h2>
      <ResourceState {...refunds} retry={refunds.refresh} />
      {refunds.data?.length === 0 && <Notice>{localize("No refunds yet.")}</Notice>}
      {refunds.data && refunds.data.length > 0 && (
        <Table caption={localize("Refunds")} headings={['When', 'Event', 'Buyer', 'Amount', 'Reason']}>
          {refunds.data.map((r) => (
            <tr key={r.id}>
              <td>{moment(r.created_at)}</td>
              <td>{r.event_title}</td>
              <td>{r.attendee_email}</td>
              <td>{money(r.amount)}</td>
              <td>{r.reason ?? '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
