import { useState } from 'react'
import { useResource } from '../organizer/data'
import { money, moment } from '../organizer/format'
import { Notice, ResourceState, Status, Table } from '../organizer/ui'
import { qs, useAction } from './actions'
import { Banner, Search } from './helpers'
import { useI18n } from "../i18n"

interface OrderRow {
  id: string
  created_at: string
  attendee_email: string
  event_title: string
  total_amount: number
  status: string
  payment_reference: string | null
}

export default function Orders() {
  const { t: localize } = useI18n()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [confirm, setConfirm] = useState('')
  const list = useResource<OrderRow[]>(`/api/admin/orders${qs({ q, status })}`)
  const { run, busy, banner } = useAction(list.refresh)
  return (
    <>
      <Search q={q} setQ={setQ} label={localize("Search email, event, order or payment reference")}>
        <label className="org-field">
          {localize("Status")}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{localize("All")}</option>
            <option value="paid">{localize("Paid")}</option>
            <option value="refunded">{localize("Refunded")}</option>
            <option value="failed">{localize("Failed payments")}</option>
            <option value="cancelled">{localize("Cancelled")}</option>
          </select>
        </label>
      </Search>
      <Banner message={banner} />
      <ResourceState {...list} retry={list.refresh} />
      {list.data?.length === 0 && <Notice>{localize("No orders match.")}</Notice>}
      {list.data && list.data.length > 0 && (
        <Table caption={localize("Orders")} headings={['Placed', 'Buyer', 'Event', 'Total', 'Status', 'Payment ref', '']}>
          {list.data.map((o) => (
            <tr key={o.id}>
              <td>{moment(o.created_at)}</td>
              <td>{o.attendee_email}</td>
              <td>{o.event_title}</td>
              <td>{money(o.total_amount)}</td>
              <td>
                <Status value={o.status} />
              </td>
              <td className="org-id">{o.payment_reference ?? '-'}</td>
              <td>
                {o.status === 'paid' && Number(o.total_amount) > 0 &&
                  (confirm === o.id ? (
                    <>
                      <button
                        className="btn org-danger"
                        disabled={busy}
                        onClick={async () => {
                          await run('Simulated refund completed.', `/api/orders/${o.id}/refund`, 'POST', { reason: 'Refunded by platform admin' })
                          setConfirm('')
                        }}
                      >
                        {localize("Confirm refund")}
                      </button>{' '}
                      <button className="btn secondary" onClick={() => setConfirm('')}>
                        {localize("Keep")}
                      </button>
                    </>
                  ) : (
                    <button className="btn secondary" onClick={() => setConfirm(o.id)}>
                      {localize("Refund")}
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
