import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { getEvent } from "../api/events";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { ProgressMeter } from "../components/ProgressMeter";
import { Screen } from "../components/Screen";
import { StatTile } from "../components/StatTile";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import type { TicketType } from "../types/ticket";
import { formatDateTime, formatPrice } from "../utils/formatting";
import {
  describeSalesWindow,
  formatPercentSold,
  summarizeInventory,
  summarizeTicketSales,
} from "../utils/ticketSales";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventDashboard">;

export function EventDashboardScreen({ route }: Props) {
  const { eventId } = route.params;
  const loadEvent = useCallback((signal: AbortSignal) => getEvent(eventId, signal), [eventId]);
  const { data: event, loading, refreshing, error, retry, refresh } = useApiResource(loadEvent);

  if (loading) return <Screen><LoadingState message="Loading ticket sales…" /></Screen>;
  if (error || !event) {
    return (
      <Screen>
        <ErrorState title="Couldn't load ticket sales" message={error ?? "Event not found."} onRetry={retry} />
      </Screen>
    );
  }

  const sales = summarizeTicketSales(event.ticket_types);
  const soldText = `${sales.sold.toLocaleString()} of ${sales.total.toLocaleString()} tickets sold`;
  const seating = event.has_assigned_seating ? "Assigned seating" : "General admission";

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
            <Text style={sharedStyles.muted}>{formatDateTime(event.start_time)}</Text>

            <View style={[sharedStyles.card, styles.summary]}>
              <Text accessibilityRole="header" style={sharedStyles.title}>Ticket sales</Text>
              <View style={styles.statRow}>
                <StatTile label="Sold" value={sales.sold.toLocaleString()} />
                <StatTile label="Remaining" value={sales.remaining.toLocaleString()} />
                <StatTile label="Percent sold" value={formatPercentSold(sales)} />
              </View>
              <ProgressMeter
                percent={sales.percentSold}
                accessibilityLabel="Tickets sold for this event"
                valueText={soldText}
              />
              <Text style={sharedStyles.muted}>{soldText}, across all ticket types</Text>
            </View>

            <Text style={sharedStyles.muted}>
              {`Capacity: ${event.capacity.toLocaleString()} people · ${seating}`}
            </Text>
            <Text style={sharedStyles.muted}>
              {`Paid sales: ${event.is_paid_sales_active ? "Activated" : "Not activated yet"}`}
            </Text>
            <Text accessibilityRole="header" style={[sharedStyles.title, styles.sectionTitle]}>
              Sales by ticket type
            </Text>
          </View>
        }
        renderItem={({ item }) => <TicketTypeSalesCard ticketType={item} />}
        ListEmptyComponent={
          <EmptyState
            title="No ticket types yet"
            message="Sales will appear here once this event has ticket types."
          />
        }
      />
    </Screen>
  );
}

function TicketTypeSalesCard({ ticketType }: { ticketType: TicketType }) {
  const sales = summarizeInventory(ticketType);
  const soldText = `${sales.sold.toLocaleString()} of ${sales.total.toLocaleString()} sold`;
  const remainingText = sales.total > 0 && sales.remaining === 0
    ? "Sold out"
    : `${sales.remaining.toLocaleString()} left`;
  const salesWindow = describeSalesWindow(ticketType.sales_start_time, ticketType.sales_end_time);

  return (
    <View style={sharedStyles.card}>
      <View style={styles.cardHeader}>
        <Text style={[sharedStyles.title, styles.cardTitle]}>{ticketType.name}</Text>
        <Text style={sharedStyles.body}>{formatPrice(ticketType.price)}</Text>
      </View>
      {ticketType.description ? <Text style={sharedStyles.muted}>{ticketType.description}</Text> : null}
      <ProgressMeter
        percent={sales.percentSold}
        accessibilityLabel={`${ticketType.name} tickets sold`}
        valueText={soldText}
      />
      <Text style={sharedStyles.body}>{`${soldText} · ${remainingText}`}</Text>
      {salesWindow ? <Text style={sharedStyles.muted}>{salesWindow}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  heading: { fontSize: theme.fontSize.heading, fontWeight: "700", color: theme.colors.text },
  summary: { marginVertical: theme.spacing.sm },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  sectionTitle: { marginTop: theme.spacing.sm },
  cardHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "baseline",
    columnGap: theme.spacing.md,
  },
  cardTitle: { flexShrink: 1 },
});
