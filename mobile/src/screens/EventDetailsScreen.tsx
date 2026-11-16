import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { getEvent } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { EventImage } from "../components/EventImage";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formatDateTime, formatPrice } from "../utils/formatting";
import { describeSalesWindow } from "../utils/ticketSales";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetails">;

export function EventDetailsScreen({ route }: Props) {
  const { eventId } = route.params;
  const { authed } = useSession();
  const loadEvent = useCallback(
    (signal: AbortSignal) => authed((token) => getEvent(eventId, signal, token)), [authed, eventId],
  );
  const { data: event, loading, refreshing, error, retry, refresh } = useApiResource(loadEvent);

  if (loading) return <Screen><LoadingState message="Loading event details…" /></Screen>;
  if (error || !event) {
    return (
      <Screen>
        <ErrorState title="Couldn't load event details" message={error ?? "Event not found."} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={event.ticket_types}
        keyExtractor={(ticketType) => ticketType.id}
        contentContainerStyle={sharedStyles.listContent}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.heading}>{event.title}</Text>
            <StatusBadge status={event.status} />
            <Text style={sharedStyles.body}>{event.venue_name}</Text>
            {event.venue_address ? <Text style={sharedStyles.body}>{event.venue_address}</Text> : null}
            <Text style={sharedStyles.body}>{formatDateTime(event.start_time)}</Text>
            {event.end_time ? <Text style={sharedStyles.muted}>Ends: {formatDateTime(event.end_time)}</Text> : null}
            {event.image_url ? <EventImage key={event.image_url} uri={event.image_url} title={event.title} /> : null}
            {event.description ? <Text style={sharedStyles.body}>{event.description}</Text> : null}
            {event.refund_policy ? <Text style={sharedStyles.body}>Refund policy: {event.refund_policy}</Text> : null}
            {event.registration_opens_at ? <Text style={sharedStyles.muted}>Registration opens: {formatDateTime(event.registration_opens_at)}</Text> : null}
            {event.registration_closes_at ? <Text style={sharedStyles.muted}>Registration closes: {formatDateTime(event.registration_closes_at)}</Text> : null}
            <Text style={sharedStyles.muted}>Buy tickets on the BiletFlow website using the same account. Your tickets will appear in My Tickets.</Text>
            <Text style={sharedStyles.muted}>Capacity: {event.capacity.toLocaleString()} people</Text>
            <Text style={sharedStyles.muted}>
              {event.has_assigned_seating ? "Assigned seating" : "General admission seating"}
            </Text>
            <Text accessibilityRole="header" style={[sharedStyles.title, styles.sectionTitle]}>
              Ticket types
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.title}>{item.name}</Text>
            {item.description ? <Text style={sharedStyles.body}>{item.description}</Text> : null}
            <Text style={styles.price}>{formatPrice(item.price)}</Text>
            <Text style={sharedStyles.body}>
              {item.quantity_available <= 0
                ? "Sold out"
                : `${item.quantity_available.toLocaleString()} of ${item.total_quantity.toLocaleString()} tickets remaining`}
            </Text>
            {Number(item.price) > 0 && (!event.is_paid_sales_active || event.paid_sales_suspended)
              ? <Text style={sharedStyles.muted}>Paid sales unavailable.</Text> : null}
            {item.sales_start_time || item.sales_end_time
              ? <Text style={sharedStyles.muted}>{describeSalesWindow(item.sales_start_time, item.sales_end_time)}</Text> : null}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState title="No ticket types yet" message="Ticket information hasn't been added to this event yet." />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  heading: { fontSize: theme.fontSize.heading, fontWeight: "700", color: theme.colors.text },
  sectionTitle: { marginTop: theme.spacing.md },
  price: { fontSize: theme.fontSize.title, fontWeight: "600", color: theme.colors.primary },
});
