import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import SupportInbox from '../support/SupportInbox'
import { useI18n } from "../i18n"

export default function SupportPage() {
  const { t: localize } = useI18n()
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <p>{localize("Loading…")}</p>
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
          {localize("Sign in")}
        </Link>{' '}
        {localize("to see your support requests.")}
      </p>
    )
  return <SupportInbox key={user.id} organizer={user.role === 'organizer'} />
}
