import { Text, View } from "react-native";

import { sharedStyles } from "../theme";
import type { Ticket } from "../types/ticket";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.title}>{ticket.event_title}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(ticket.start_time)}</Text>
      <Text style={sharedStyles.body}>Attendee: {ticket.attendee_name}</Text>
      <StatusBadge status={ticket.status} />
    </View>
  );
}
