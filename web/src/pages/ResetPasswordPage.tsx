import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

interface MessageResponse {
  message: string
}

export default function ResetPasswordPage() {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const token = code.trim()
    if (!token) {
      setError('Please enter your reset code.')
      return
    }
    if (Array.from(password).length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('Password is too long; use at most 72 bytes.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const data = await api<MessageResponse>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: password },
      })
      setSuccess(data.message)
      setCode('')
      setPassword('')
      setConfirm('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Reset password</h1>
      {success ? (
        <p className="success" role="status">
          {success}. <Link to="/login">Sign in</Link>
        </p>
      ) : (
        <form className="form" onSubmit={submit}>
          <label htmlFor="reset-code">Reset code</label>
          <input
            id="reset-code"
            required
            disabled={busy}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            disabled={busy}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      )}
    </>
  )
}
