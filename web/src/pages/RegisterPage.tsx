import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function RegisterPage() {
  const { register } = useAuth()
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
    if (password.length < 8 || password.length > 72) return setError('Password must be 8 to 72 characters')
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
      <h1>Create an account</h1>
      <form className="form" onSubmit={onSubmit}>
        <input aria-label="Full name" required disabled={busy} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
        <input aria-label="Email" type="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input aria-label="Password" type="password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" />
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login" state={{ from }}>Sign in</Link>
      </p>
    </>
  )
}