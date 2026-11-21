import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

interface MessageResponse {
  message: string
}

export default function VerifyEmailPage() {
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (verifying || resending) return
    const token = code.trim()
    if (!token) {
      setError('Please enter your verification code.')
      return
    }
    setVerifying(true)
    setError('')
    setSuccess('')
    try {
      const data = await api<MessageResponse>('/api/auth/verify-email', {
        method: 'POST',
        body: { token },
      })
      setSuccess(data.message)
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify your email')
    } finally {
      setVerifying(false)
    }
  }

  async function resend() {
    if (verifying || resending) return
    setResending(true)
    setError('')
    setResendMessage('')
    try {
      const data = await api<MessageResponse>(
        '/api/auth/resend-verification',
        { method: 'POST' },
      )
      setResendMessage(data.message)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not send a new verification code',
      )
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <h1>Verify your email</h1>
      <p className="muted">
        In this demo, verification codes arrive as notifications instead of email.
      </p>
      {success ? (
        <p className="success" role="status">
          {success}. <Link to="/" reloadDocument>Back to events</Link>
        </p>
      ) : (
        <form className="form" onSubmit={verify}>
          <label htmlFor="verification-code">Verification code</label>
          <input
            id="verification-code"
            required
            disabled={verifying || resending}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" type="submit" disabled={verifying || resending}>
            {verifying ? 'Verifying…' : 'Verify email'}
          </button>
        </form>
      )}
      {user && !success && (
        <div className="auth-secondary-action">
          <button
            className="btn secondary"
            type="button"
            disabled={verifying || resending}
            onClick={resend}
          >
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
          {resendMessage && (
            <p className="success" role="status">
              {resendMessage}
            </p>
          )}
        </div>
      )}
    </>
  )
}
