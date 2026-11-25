import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { getEvent, getEventAnalytics } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
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
import { formatDateTime, formatMoney, formatPrice } from "../utils/formatting";
import { eventDisplayStatus } from "../utils/eventTiming";
import {
  describeSalesWindow,
  formatPercentSold,
  summarizeInventory,
} from "../utils/ticketSales";
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventDashboard">;

export function EventDashboardScreen({ route, navigation }: Props) {
  const { lang, t: localize } = useLocale();
  const { eventId } = route.params;
  const { authed } = useSession();
  const loadEvent = useCallback(
    (signal: AbortSignal) => authed(async (token) => {
      const [event, analytics] = await Promise.all([
        getEvent(eventId, signal, token), getEventAnalytics(eventId, token, signal),
      ]);
      return { ...event, analytics };
    }),
    [authed, eventId],
  );
  const { data: event, loading, refreshing, error, retry, refresh } = useApiResource(loadEvent);

  if (loading) return <Screen><LoadingState message={localize("Loading ticket sales…")} /></Screen>;
  if (error || !event) {
    return (
      <Screen>
        <ErrorState title={localize("Couldn't load ticket sales")} message={error ?? "Event not found."} onRetry={retry} />
      </Screen>
    );
  }

  const held = event.analytics.inventory.general_admission_reserved ?? 0;
  const sales = {
    sold: event.analytics.inventory.sold, remaining: event.analytics.inventory.remaining - held,
    total: event.analytics.inventory.total, percentSold: event.analytics.inventory.percent_sold };
  const soldText = localize("{sold} of {total} tickets sold", { sold: sales.sold.toLocaleString(), total: sales.total.toLocaleString() });
  const seating = localize(event.has_assigned_seating ? "Assigned seating" : "General admission");

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
            <View style={[sharedStyles.card, sharedStyles.accentCard]}>
            <Text accessibilityRole="header" style={sharedStyles.heading}>{event.title}</Text>
            <StatusBadge status={eventDisplayStatus(event)} />
            <Text style={sharedStyles.body}>{event.venue_name}</Text>
            <Text style={sharedStyles.muted}>{formatDateTime(event.start_time, lang)}</Text>
            <AppButton title={localize("Event setup")} onPress={() => navigation.navigate("EventSetup", { eventId })} />
            </View>

            <View style={[sharedStyles.card, styles.summary]}>
              <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Ticket sales")}</Text>
              <View style={styles.statRow}>
                <StatTile label={localize("Sold")} value={sales.sold.toLocaleString()} />
                <StatTile label={localize("Available")} value={sales.remaining.toLocaleString()} />
                <StatTile label={localize("Percent sold")} value={formatPercentSold(sales)} />
              </View>
              <ProgressMeter
                percent={sales.percentSold}
                accessibilityLabel={localize("Tickets sold for this event")}
                valueText={soldText}
              />
              <Text style={sharedStyles.muted}>{localize("{sold} · All ticket types", { sold: soldText })}</Text>
              <Text style={sharedStyles.muted}>{localize("General-admission tickets held: {count}", { count: held })}</Text>
            </View>

            <View style={sharedStyles.card}>
              <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Sales and attendance")}</Text>
              <Text style={sharedStyles.body}>{localize("Revenue after discounts and refunds:")} {formatMoney(event.analytics.money.net_revenue, lang)}</Text>
              <Text style={sharedStyles.body}>{localize("Refunds:")} {formatMoney(event.analytics.money.refunds, lang)}</Text>
              <Text style={sharedStyles.body}>{localize("Estimated payout:")} {formatMoney(event.analytics.money.estimated_payout, lang)}</Text>
              <Text style={sharedStyles.body}>{localize("{admitted} checked in of {registered} registered", {
                admitted: event.analytics.attendance.checked_in, registered: event.analytics.attendance.registered,
              })}</Text>
              <Text style={sharedStyles.muted}>{localize("Demo payments. Revenue is before processing fees; estimated payout subtracts simulated fees.")}</Text>
            </View>

            <Text style={sharedStyles.muted}>
              {localize("Capacity: {count} people · {seating}", { count: event.capacity.toLocaleString(), seating })}
            </Text>
            <Text style={sharedStyles.muted}>
              {localize("Paid sales:")} {localize(event.paid_sales_suspended ? "Suspended by platform" : event.is_paid_sales_active ? "Activated" : "Not activated yet")}
            </Text>
            <AppButton
              variant="secondary"
              title={event.is_paid_sales_active || event.paid_sales_suspended ? localize("Paid sales details") : localize("Activate paid sales")}
              onPress={() => navigation.navigate("PaidSalesActivation", { eventId, eventTitle: event.title })}
            />
            <View style={sharedStyles.card}>
              <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Manage event")}</Text>
              <AppButton variant="secondary" title={localize("Attendees")} onPress={() => navigation.navigate("EventAttendees", { eventId, eventTitle: event.title })} />
              <AppButton variant="secondary" title={localize("Orders and refunds")} onPress={() => navigation.navigate("EventOrders", { eventId, eventTitle: event.title })} />
              <AppButton variant="secondary" title={localize("Promotions")} onPress={() => navigation.navigate("EventPromotions", { eventId, eventTitle: event.title })} />
              <AppButton variant="secondary" title={localize("Event activity")} onPress={() => navigation.navigate("EventActivity", { eventId, eventTitle: event.title })} />
              <AppButton variant="secondary" title={localize("Door staff")} onPress={() => navigation.navigate("EventStaff", { eventId, eventTitle: event.title })} />
            </View>
              <Text style={sharedStyles.muted}>{localize("Detailed analytics are available on the BiletFlow website.")}</Text>
            <Text accessibilityRole="header" style={[sharedStyles.title, styles.sectionTitle]}>
              {localize("Sales by ticket type")}
            </Text>
          </View>
        }
        renderItem={({ item }) => <TicketTypeSalesCard ticketType={item} />}
        ListEmptyComponent={
          <EmptyState
            title={localize("No ticket types yet")}
            message={localize("Sales will appear here once this event has ticket types.")}
          />
        }
      />
    </Screen>
  );
}

function TicketTypeSalesCard({ ticketType }: { ticketType: TicketType }) {
  const { lang } = useLocale();
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
        <Text style={sharedStyles.body}>{formatPrice(ticketType.price, lang)}</Text>
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
