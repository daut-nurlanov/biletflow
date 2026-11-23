import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'

export default function LoginPage() {
  const { login } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fromState: unknown = location.state?.from
  const from =
    typeof fromState === 'string' &&
    fromState.startsWith('/') &&
    !fromState.startsWith('//')
      ? fromState
      : undefined

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const user = await login(email, password)
      navigate(from ?? (user.role === 'organizer' ? '/organizer' : user.role === 'platform_admin' ? '/admin' : '/'), {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('Sign in')}</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          {t('Email')}
          <input
            type="email"
            autoComplete="username"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t('Password')}
          <input
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t('Signing in…') : t('Sign in')}
        </button>
      </form>
      <p className="muted">
        {t('No account?')} <Link to="/register" state={{ from }}>{t('Register')}</Link>
      </p>
      <p className="muted">
        <Link to="/forgot-password">{t('Forgot password?')}</Link>
      </p>
    </>
  )
}
