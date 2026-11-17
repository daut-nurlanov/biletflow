import { useManagedEvent } from './Layout'
import SupportInbox from '../support/SupportInbox'

export default function EventSupportPage() {
  const event = useManagedEvent()
  return <SupportInbox key={event.id} organizer eventId={event.id} />
}
