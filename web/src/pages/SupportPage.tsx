import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import SupportInbox from '../support/SupportInbox'

export default function SupportPage() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <p>Loading…</p>
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  if (!user)
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname + location.search }}>
          Sign in
        </Link>{' '}
        to see your support requests.
      </p>
    )
  return <SupportInbox key={user.id} organizer={user.role === 'organizer'} />
}
