import type { ImageURISource } from "react-native";
import { Text, View } from "react-native";

import { sharedStyles } from "../theme";
import type { Ticket } from "../types/ticket";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";
import { TicketQrCode } from "./TicketQrCode";

interface TicketCardProps {
  ticket: Ticket;
  qrImageSource: ImageURISource;
}

const admissionMessages = {
  valid: "Show this QR code to door staff. Admission is confirmed when scanned.",
  checked_in: "Already checked in. This ticket has been used for admission.",
  cancelled: "This ticket was cancelled and cannot be used for admission.",
  refunded: "This ticket was refunded and cannot be used for admission.",
};

export function TicketCard({ ticket, qrImageSource }: TicketCardProps) {
  // The scanner rejects these events even when the ticket itself is still valid.
  const eventBlocked = ticket.event_status === "cancelled" || ticket.event_status === "suspended";
  const showQr = ticket.status === "valid" && !eventBlocked;

  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.title}>{ticket.event_title}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(ticket.start_time)}</Text>
      <Text style={sharedStyles.body}>Attendee: {ticket.attendee_name}</Text>
      <StatusBadge status={ticket.status} />
      {eventBlocked ? (
        <Text style={sharedStyles.body}>
          {ticket.event_status === "cancelled"
            ? "Event cancelled. This ticket cannot be used for admission."
            : "Event suspended. Admission is currently unavailable."}
        </Text>
      ) : null}
      <Text style={sharedStyles.body}>
        {ticket.status === "valid" && eventBlocked
          ? "The admission QR is unavailable for this event."
          : admissionMessages[ticket.status] ?? "Ticket status unavailable. Ask door staff for help."}
      </Text>
      {showQr ? (
        <TicketQrCode
          source={qrImageSource}
          accessibilityLabel={`Admission QR code for ${ticket.event_title}, ${ticket.attendee_name}`}
        />
      ) : null}
    </View>
  );
}
