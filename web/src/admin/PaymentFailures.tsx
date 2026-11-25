import { useState } from 'react'
import { useResource } from '../organizer/data'
import { money, moment } from '../organizer/format'
import { Notice, ResourceState, Table } from '../organizer/ui'
import { useI18n } from "../i18n"

interface FailedPayment {
  id: string
  event_id: string
  event_title: string
  attendee_email: string
  total_amount: number | string
  payment_reference: string | null
  created_at: string
}

export default function PaymentFailures() {
  const { t: localize } = useI18n()
  const resource = useResource<FailedPayment[]>('/api/admin/payment-failures')
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const rows = resource.data?.filter((row) =>
    [
      row.id,
      row.event_title,
      row.attendee_email,
      row.payment_reference ?? '',
    ].some((value) => value.toLowerCase().includes(term)),
  )
  return (
    <>
      <div className="org-heading">
        <div>
          <h2>{localize("Payment failures")}</h2>
          <p className="muted">
            {localize("Latest 200 failed simulated payments, newest first. Times use Almaty time.")}
          </p>
        </div>
        <button className="btn secondary" onClick={resource.refresh}>
          {localize("Refresh payment failures")}
        </button>
      </div>
      <Notice>
        {localize("Read-only payment attempts. Failed attempts do not issue valid tickets. This API does not provide a detailed failure reason or a retry/refund action.")}
      </Notice>
      <label className="org-field org-filter">
        {localize("Search loaded failures")}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={localize("Email, event, order or payment reference")}
        />
      </label>
      <ResourceState {...resource} retry={resource.refresh} />
      {resource.data?.length === 0 && <Notice>{localize("No failed payments.")}</Notice>}
      {resource.data && resource.data.length > 0 && rows?.length === 0 && (
        <Notice>{localize("No loaded failures match your search.")}</Notice>
      )}
      {rows && rows.length > 0 && (
        <>
          <p className="muted">
            {localize('{shown} of {total} loaded failures shown.', { shown: rows.length, total: resource.data?.length ?? 0 })}
          </p>
          <Table
            caption={localize("Failed simulated payments")}
            headings={[
              'Attempted',
              'Buyer',
              'Event',
              'Amount (KZT)',
              'Order ID',
              'Payment reference',
            ]}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{moment(row.created_at)}</td>
                <td>{row.attendee_email}</td>
                <td>{row.event_title}</td>
                <td>{money(row.total_amount)}</td>
                <td className="org-id">{row.id}</td>
                <td className="org-id">
                  {row.payment_reference ?? 'Not recorded'}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  )
}
