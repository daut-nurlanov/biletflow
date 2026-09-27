import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { getEvent } from "../api/events";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formatDateTime, formatPrice } from "../utils/formatting";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetails">;

export function EventDetailsScreen({ route }: Props) {
  const { eventId } = route.params;
  const loadEvent = useCallback((signal: AbortSignal) => getEvent(eventId, signal), [eventId]);
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
            <Text style={sharedStyles.body}>{formatDateTime(event.start_time)}</Text>
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
