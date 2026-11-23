import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useI18n } from '../i18n'

const neutralMessage = 'If that email has an account, a reset code was sent.'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await api('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      })
    } catch {
      // Keep the same neutral response so this page never reveals account status.
    } finally {
      setMessage(neutralMessage)
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('Forgot password')}</h1>
      <p className="muted">
        {t('In this demo, reset codes arrive as notifications instead of email.')}
      </p>
      {!message && (
        <form className="form" onSubmit={submit}>
          <label htmlFor="reset-email">{t('Email')}</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t('Sending…') : t('Send reset code')}
          </button>
        </form>
      )}
      {message && (
        <p className="success" role="status">
          {t(message)}
        </p>
      )}
      <p>
        <Link to="/reset-password">{t('I have a reset code')}</Link>
      </p>
    </>
  )
}
