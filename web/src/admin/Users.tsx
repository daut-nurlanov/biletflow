import { useState } from 'react'
import { useResource } from '../organizer/data'
import { moment } from '../organizer/format'
import { Notice, ResourceState, Table } from '../organizer/ui'
import { qs, useAction } from './actions'
import { Banner, Search } from './helpers'

interface UserRow {
  id: string
  email: string
  full_name: string
  role: string
  is_email_verified: boolean
  is_suspended: boolean
  created_at: string
}

export default function Users() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const list = useResource<UserRow[]>(`/api/admin/users${qs({ q, role })}`)
  const { run, busy, banner } = useAction(list.refresh)
  return (
    <>
      <Search q={q} setQ={setQ} label="Search name or email">
        <label className="org-field">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All</option>
            <option value="attendee">Attendee</option>
            <option value="organizer">Organizer</option>
            <option value="event_admin">Door staff</option>
            <option value="platform_admin">Admin</option>
          </select>
        </label>
      </Search>
      <Banner message={banner} />
      <ResourceState {...list} retry={list.refresh} />
      {list.data?.length === 0 && <Notice>No users match.</Notice>}
      {list.data && list.data.length > 0 && (
        <Table caption="Users" headings={['Name', 'Email', 'Role', 'Joined', 'Status', '']}>
          {list.data.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{moment(u.created_at)}</td>
              <td>{u.is_suspended ? 'Suspended' : 'Active'}</td>
              <td>
                {u.role !== 'platform_admin' &&
                  (u.is_suspended ? (
                    <button className="btn secondary" disabled={busy} onClick={() => run(`${u.email} was unsuspended.`, `/api/admin/users/${u.id}/unsuspend`)}>
                      Unsuspend
                    </button>
                  ) : (
                    <button className="btn org-danger" disabled={busy} onClick={() => {
                      if (window.confirm(`Suspend ${u.email}? This blocks the account from signing in or using its current session.`)) {
                        void run(`${u.email} was suspended.`, `/api/admin/users/${u.id}/suspend`)
                      }
                    }}>
                      Suspend
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
