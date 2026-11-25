import { Text, View } from "react-native";

import { sharedStyles } from "../theme";
import type { Ticket } from "../types/ticket";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";
import { TicketQrCode } from "./TicketQrCode";
import { AppButton } from "./AppButton";
import { useLocale } from "../i18n/LocaleContext";

interface TicketCardProps {
  ticket: Ticket;
  onSupport?: () => void;
  onPdf?: () => void;
  pdfLoading?: boolean;
  pastEvent?: boolean;
}

const admissionMessages = {
  valid: "Show this QR code to door staff. Admission is confirmed when scanned.",
  checked_in: "Already checked in. This ticket has been used for admission.",
  cancelled: "This ticket was cancelled and cannot be used for admission.",
  refunded: "This ticket was refunded and cannot be used for admission.",
};

export function TicketCard({ ticket, onSupport, onPdf, pdfLoading, pastEvent }: TicketCardProps) {
  const { lang, t: localize } = useLocale();
  // The scanner rejects these events even when the ticket itself is still valid.
  const eventBlocked = ticket.event_status === "cancelled" || ticket.event_status === "suspended";
  const admissionStatus = ticket.status === "valid" && eventBlocked ? ticket.event_status : ticket.status;

  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.title}>{ticket.event_title}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(ticket.start_time, lang)}</Text>
      {ticket.venue_name ? <Text style={sharedStyles.body}>{ticket.venue_name}</Text> : null}
      {ticket.venue_address ? <Text style={sharedStyles.body}>{ticket.venue_address}</Text> : null}
      {ticket.ticket_type_name ? <Text style={sharedStyles.body}>{ticket.ticket_type_name}</Text> : null}
      {ticket.section ? <Text style={sharedStyles.body}>Section {ticket.section}, row {ticket.row_label}, seat {ticket.seat_number}</Text> : null}
      <Text style={sharedStyles.body}>{localize("Attendee:")} {ticket.attendee_name}</Text>
      <Text style={sharedStyles.muted}>Ticket ending {ticket.id.slice(-8)}</Text>
      <StatusBadge status={admissionStatus} />
      {pastEvent ? <Text style={sharedStyles.muted}>{localize("Past event")}</Text> : null}
      {eventBlocked ? (
        <Text style={sharedStyles.body}>
          {ticket.event_status === "cancelled"
            ? localize("Event cancelled. This ticket cannot be used for admission.")
            : localize("Event suspended. Admission is currently unavailable.")}
        </Text>
      ) : null}
      <Text style={sharedStyles.body}>
        {ticket.status === "valid" && eventBlocked
          ? localize("The admission QR is unavailable for this event.")
          : admissionMessages[ticket.status] ?? "Ticket status unavailable. Ask door staff for help."}
      </Text>
      {admissionStatus === "valid" ? (
        <TicketQrCode
          ticketId={ticket.id}
          accessibilityLabel={`Admission QR code for ${ticket.event_title}, ${ticket.attendee_name}`}
        />
      ) : null}
      {onPdf ? <AppButton title={localize("Open ticket PDF")} variant="secondary" loading={pdfLoading} onPress={onPdf} /> : null}
      {onSupport ? <AppButton title={localize("Get help with this ticket")} variant="secondary" onPress={onSupport} /> : null}
    </View>
  );
}
