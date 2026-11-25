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
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await api('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      })
      setMessage(neutralMessage)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not request a reset code.')
    } finally {
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
      {error && <p className="error" role="alert">{t(error)}</p>}
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
