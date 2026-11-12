import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('dana@example.com') // demo account, remove before the final demo
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate(from)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <form className="form" onSubmit={onSubmit}>
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit">Sign in</button>
      </form>
      <p className="muted">
        No account? <Link to="/register" state={{ from }}>Register</Link>
      </p>
    </>
  )
}