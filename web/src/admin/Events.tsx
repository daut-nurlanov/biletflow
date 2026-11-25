import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useResource } from '../organizer/data'
import { moment } from '../organizer/format'
import { Notice, ResourceState, Status, Table } from '../organizer/ui'
import { qs, useAction } from './actions'
import { Banner, Search } from './helpers'

interface EventRow {
  id: string
  title: string
  status: string
  start_time: string
  organizer_email: string
  open_reports: number
  is_paid_sales_active: boolean
  paid_sales_suspended: boolean
  payout_status: string
}

const PAYOUTS = ['not_started', 'pending', 'processing', 'paid', 'failed']

export default function Events() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const list = useResource<EventRow[]>(`/api/admin/events${qs({ q, status })}`)
  const { run, busy, banner } = useAction(list.refresh)
  return (
    <>
      <Search q={q} setQ={setQ} label="Search title or organizer">
        <label className="org-field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['draft', 'upcoming', 'active', 'completed', 'cancelled', 'suspended'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </Search>
      <Banner message={banner} />
      <ResourceState {...list} retry={list.refresh} />
      {list.data?.length === 0 && <Notice>No events match.</Notice>}
      {list.data && list.data.length > 0 && (
        <Table caption="Events" headings={['Event', 'Organizer', 'Status', 'Reports', 'Paid sales', 'Payout', 'Actions']}>
          {list.data.map((e) => (
            <tr key={e.id}>
              <td>
                <Link to={`/events/${e.id}`}>{e.title}</Link>
                <div className="muted">{moment(e.start_time)}</div>
              </td>
              <td>{e.organizer_email}</td>
              <td>
                <Status value={e.status} />
              </td>
              <td>{e.open_reports}</td>
              <td>
                {e.paid_sales_suspended ? 'Suspended' : e.is_paid_sales_active ? 'Active' : 'Off'}
              </td>
              <td>
                <select
                  aria-label={`Payout status for ${e.title}`}
                  value={e.payout_status}
                  disabled={busy}
                  onChange={(ev) => run(`Payout status set to ${ev.target.value}. The organizer was notified.`, `/api/admin/events/${e.id}/payout-status`, 'PUT', { status: ev.target.value })}
                >
                  {PAYOUTS.map((p) => (
                    <option key={p} value={p}>
                      {p.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="org-actions">
                {e.status === 'suspended' ? (
                  <button className="btn secondary" disabled={busy} onClick={() => run(`${e.title} was reinstated.`, `/api/admin/events/${e.id}/reinstate`)}>
                    Reinstate
                  </button>
                ) : (
                  e.status !== 'cancelled' &&
                  e.status !== 'completed' && (
                    <button className="btn org-danger" disabled={busy} onClick={() => {
                      if (window.confirm(`Suspend “${e.title}”? This stops ticket sales and blocks admission.`)) {
                        void run(`${e.title} was suspended.`, `/api/admin/events/${e.id}/suspend`)
                      }
                    }}>
                      Suspend
                    </button>
                  )
                )}
                {e.is_paid_sales_active &&
                  (e.paid_sales_suspended ? (
                    <button className="btn secondary" disabled={busy} onClick={() => run('Paid sales restored.', `/api/admin/events/${e.id}/restore-paid-sales`)}>
                      Restore paid sales
                    </button>
                  ) : (
                    <button className="btn secondary" disabled={busy} onClick={() => {
                      if (window.confirm(`Freeze paid sales for “${e.title}”? Free registrations can continue.`)) {
                        void run('Paid sales frozen. Free tickets still work.', `/api/admin/events/${e.id}/suspend-paid-sales`)
                      }
                    }}>
                      Freeze paid sales
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
