import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";

import { getEvent, reportEvent } from "../api/events";
import { AppButton } from "../components/AppButton";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { EventImage } from "../components/EventImage";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { EventsStackParamList, RootTabParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formatDateTime, formatPrice } from "../utils/formatting";
import { eventDisplayStatus } from "../utils/eventTiming";
import { describeSalesWindow } from "../utils/ticketSales";
import { useLocale } from "../i18n/LocaleContext";

type Props = CompositeScreenProps<NativeStackScreenProps<EventsStackParamList, "EventDetails">, BottomTabScreenProps<RootTabParamList>>;

export function EventDetailsScreen({ route, navigation }: Props) {
  const { lang, t: localize } = useLocale();
  const { eventId } = route.params;
  const { authed } = useSession();
  const loadEvent = useCallback(
    (signal: AbortSignal) => authed((token) => getEvent(eventId, signal, token)), [authed, eventId],
  );
  const { data: event, loading, refreshing, error, retry, refresh } = useApiResource(loadEvent);

  if (loading) return <Screen><LoadingState message={localize("Loading event details…")} /></Screen>;
  if (error || !event) {
    return (
      <Screen>
        <ErrorState title={localize("Couldn't load event details")} message={error ?? "Event not found."} onRetry={retry} />
      </Screen>
    );
  }

  const status = eventDisplayStatus(event);

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
            <EventImage key={event.image_url} uri={event.image_url} title={event.title} category={event.category} />
            <View style={sharedStyles.card}>
            {event.category ? <Text style={styles.category}>{event.category}</Text> : null}
            <Text accessibilityRole="header" style={sharedStyles.heading}>{event.title}</Text>
            <StatusBadge status={status} />
            <Text style={sharedStyles.body}>{event.venue_name}</Text>
            {event.venue_address ? <Text style={sharedStyles.body}>{event.venue_address}</Text> : null}
            <Text style={sharedStyles.body}>{formatDateTime(event.start_time, lang)}</Text>
            {event.end_time ? <Text style={sharedStyles.muted}>{localize("Ends:")} {formatDateTime(event.end_time, lang)}</Text> : null}
            </View>
            {event.description ? <Text style={sharedStyles.body}>{event.description}</Text> : null}
            {event.refund_policy ? <Text style={sharedStyles.body}>{localize("Refund policy:")} {event.refund_policy}</Text> : null}
            {event.registration_opens_at ? <Text style={sharedStyles.muted}>{localize("Registration opens:")} {formatDateTime(event.registration_opens_at, lang)}</Text> : null}
            {event.registration_closes_at ? <Text style={sharedStyles.muted}>{localize("Registration closes:")} {formatDateTime(event.registration_closes_at, lang)}</Text> : null}
            <Text style={sharedStyles.muted}>{localize("Buy tickets here or on the website using the same account. Your tickets appear in My Tickets.")}</Text>
            {event.has_assigned_seating ? <Text style={sharedStyles.body}>{localize("This mobile checkout supports general admission. Assigned-seat checkout is not available in this app.")}</Text> : null}
            <ReportEvent eventId={eventId} />
            <AppButton title={localize("Get help with this event")} variant="secondary"
              onPress={() => navigation.navigate("SupportTab", { screen: "SupportNew", params: { eventId } })} />
            <Text style={sharedStyles.muted}>{localize("Capacity: {count} people", { count: event.capacity.toLocaleString() })}</Text>
            <Text style={sharedStyles.muted}>
              {event.has_assigned_seating ? localize("Assigned seating") : localize("General admission seating")}
            </Text>
            <Text accessibilityRole="header" style={[sharedStyles.title, styles.sectionTitle]}>
              {localize("Ticket types")}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.title}>{item.name}</Text>
            {item.description ? <Text style={sharedStyles.body}>{item.description}</Text> : null}
            <Text style={styles.price}>{formatPrice(item.price, lang)}</Text>
            <Text style={sharedStyles.body}>
              {item.quantity_available <= 0
                ? localize("Sold out")
                : `${item.quantity_available.toLocaleString()} of ${item.total_quantity.toLocaleString()} tickets remaining`}
            </Text>
            {Number(item.price) > 0 && (!event.is_paid_sales_active || event.paid_sales_suspended)
              ? <Text style={sharedStyles.muted}>{localize("Paid sales unavailable.")}</Text> : null}
            {item.sales_start_time || item.sales_end_time
              ? <Text style={sharedStyles.muted}>{describeSalesWindow(item.sales_start_time, item.sales_end_time)}</Text> : null}
            <AppButton title={item.quantity_available <= 0 ? localize("Sold out") : localize("Choose tickets")}
              accessibilityLabel={item.quantity_available <= 0 ? `${item.name}: Sold out` : `Choose ${item.name} tickets`}
              disabled={event.has_assigned_seating || item.quantity_available <= 0 ||
                (status !== "upcoming" && status !== "active") ||
                (Number(item.price) > 0 && (!event.is_paid_sales_active || event.paid_sales_suspended))}
              onPress={() => navigation.navigate("Checkout", { eventId, ticketTypeId: item.id })} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState title={localize("No ticket types yet")} message={localize("Ticket information hasn't been added to this event yet.")} />
        }
      />
    </Screen>
  );
}

/** Lets a signed-in person tell the platform team that an event looks wrong. */
function ReportEvent({ eventId }: { eventId: string }) {
  const { t: localize } = useLocale();
  const { authed } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  async function send() {
    if (locked.current) return;
    if (!reason.trim()) { setError("Tell us what is wrong with this event."); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      await authed((token) => reportEvent(token, eventId, reason));
      setReason(""); setOpen(false);
      setMessage("Thank you. Your report was sent to the BiletFlow team.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the report.");
    } finally { locked.current = false; setBusy(false); }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {message ? <Text accessibilityRole="alert" style={sharedStyles.muted}>{message}</Text> : null}
      {open ? (
        <>
          <TextInput value={reason} onChangeText={setReason} multiline placeholder={localize("What is wrong with this event?")}
            placeholderTextColor={theme.colors.muted} accessibilityLabel={localize("Reason for the report")} editable={!busy}
            style={{ minHeight: 90, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
              padding: theme.spacing.md, color: theme.colors.text, backgroundColor: theme.colors.surface, textAlignVertical: "top" }} />
          {error ? <Text accessibilityRole="alert" style={{ color: "#B42318" }}>{error}</Text> : null}
          <AppButton title={localize("Send report")} onPress={send} loading={busy} />
          <AppButton title={localize("Cancel")} onPress={() => { setOpen(false); setError(null); }} disabled={busy} />
        </>
      ) : (
        <AppButton title={localize("Report this event")} variant="secondary" onPress={() => { setOpen(true); setMessage(null); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  category: { color: theme.colors.accentInk, fontSize: theme.fontSize.small, fontWeight: "700" },
  sectionTitle: { marginTop: theme.spacing.md },
  price: { fontSize: theme.fontSize.title, fontWeight: "600", color: theme.colors.primary },
});
