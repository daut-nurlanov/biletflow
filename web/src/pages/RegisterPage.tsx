import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'

export default function RegisterPage() {
  const { register } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState: unknown = location.state?.from
  const from =
    typeof fromState === 'string' && fromState.startsWith('/') && !fromState.startsWith('//')
      ? fromState
      : undefined
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (fullName.trim().length === 0) return setError('Please enter your name')
    if (Array.from(password).length < 8) return setError(t('Password must be at least 8 characters.'))
    if (new TextEncoder().encode(password).length > 72) return setError(t('Password is too long; use at most 72 bytes.'))
    setBusy(true)
    try {
      await register(fullName.trim(), email.trim(), password)
      navigate(from ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('Create an account')}</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>{t('Full name')}
          <input required autoComplete="name" disabled={busy} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>{t('Email')}
          <input type="email" required autoComplete="email" disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>{t('Password')}
          <input type="password" required autoComplete="new-password" disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? t('Creating…') : t('Create account')}</button>
      </form>
      <p className="muted">
        {t('Already have an account?')} <Link to="/login" state={{ from }}>{t('Sign in')}</Link>
      </p>
    </>
  )
}
