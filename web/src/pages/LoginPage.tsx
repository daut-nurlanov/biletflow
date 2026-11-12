import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('dana@example.com')
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const user = await login(email, password)
      const from: unknown = location.state?.from
      navigate(
        typeof from === 'string' &&
          from.startsWith('/') &&
          !from.startsWith('//')
          ? from
          : user.role === 'organizer'
            ? '/organizer'
            : '/',
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Вход</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Email
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
          Пароль
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
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </>
  )
}
