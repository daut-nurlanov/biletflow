import { useEffect, useRef, useState } from 'react'
import { apiResponse } from '../api'
import { useAuth } from '../auth'
import { messageFor } from '../organizer/data'

export default function CalendarButton({
  eventId,
  cancelled = false,
}: {
  eventId: string
  cancelled?: boolean
}) {
  const { user } = useAuth()
  return (
    <CalendarDownload
      key={`${eventId}:${user?.id ?? 'public'}:${cancelled}`}
      eventId={eventId}
      cancelled={cancelled}
    />
  )
}

function CalendarDownload({
  eventId,
  cancelled,
}: {
  eventId: string
  cancelled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function download() {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setDone(false)
    try {
      const response = await apiResponse(
        `/api/events/${encodeURIComponent(eventId)}/export.ics`,
        { signal: controller.signal },
      )
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('text/calendar')
      )
        throw new Error(
          'The server did not return a calendar file. Please try again.',
        )
      const blob = await response.blob()
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `event-${eventId}.ics`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDone(true)
    } catch (err) {
      if (!controller.signal.aborted) setError(messageFor(err))
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  return (
    <div className="calendar-action">
      <button
        className="btn secondary"
        disabled={busy}
        onClick={() => {
          void download()
        }}
      >
        {busy
          ? 'Preparing calendar…'
          : cancelled
            ? 'Download calendar cancellation (.ics)'
            : 'Add to calendar (.ics)'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="muted" role="status">
          Calendar file prepared. Open the downloaded .ics file in your calendar
          app{cancelled ? ' to update the cancelled event' : ''}.
        </p>
      )}
    </div>
  )
}
