import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getEventAttendees } from "../api/organizer";
import { useSession } from "../auth/SessionContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterChips } from "../components/FilterChips";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { formatDateTime } from "../utils/formatting";
import { organizerMessage, seatLabel } from "../utils/organizerOrders";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventAttendees">;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "checked_in", label: "Checked in" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
] as const;

/** Wait for a pause in typing before asking the backend. */
const SEARCH_DELAY_MS = 400;

export function EventAttendeesScreen({ route, navigation }: Props) {
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getEventAttendees(token, eventId, { q: query, status }, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, eventId, query, status],
  );
  const resource = useApiResource(load);
  const rows = resource.data ?? [];
  const filtered = query !== "" || status !== "";

  return (
    <Screen>
      <FlatList
        data={resource.loading || resource.error ? [] : rows}
        keyExtractor={(row) => row.ticket_id}
        contentContainerStyle={sharedStyles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={resource.refreshing}
        onRefresh={resource.refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
            <Text style={sharedStyles.muted}>One row per ticket. The email belongs to the person who bought the order.</Text>
            <TextInput
              accessibilityLabel="Search attendees by name or email"
              placeholder="Search by name or email"
              placeholderTextColor={theme.colors.muted}
              style={formStyles.input}
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              maxLength={254}
              onSubmitEditing={() => setQuery(text.trim())}
            />
            <FilterChips label="Ticket status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            {!resource.loading && !resource.error ? (
              <Text accessibilityLiveRegion="polite" style={sharedStyles.muted}>
                {`${rows.length.toLocaleString()} ${rows.length === 1 ? "ticket" : "tickets"}${filtered ? " match" : ""}`}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          resource.loading ? <LoadingState message="Loading attendees…" />
            : resource.error ? <ErrorState title="Couldn't load attendees" message={resource.error} onRetry={resource.retry} />
              : filtered
                ? <EmptyState title="No matches" message="No tickets match this search. Try another name, email or status." />
                : <EmptyState title="No attendees yet" message="Tickets appear here as soon as someone buys or registers." />
        }
        renderItem={({ item }) => {
          const seat = seatLabel(item);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.attendee_name}, ${item.ticket_type}. Opens the order`}
              onPress={() => navigation.navigate("OrderDetail", { orderId: item.order_id, eventId })}
              style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
            >
              <View style={styles.rowTop}>
                <View style={styles.rowText}>
                  <Text style={sharedStyles.title}>{item.attendee_name}</Text>
                  <Text style={sharedStyles.muted}>{item.email}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <Text style={sharedStyles.body}>{[item.ticket_type, seat && `Seat ${seat}`].filter(Boolean).join(" · ")}</Text>
              <Text style={sharedStyles.muted}>
                {item.checked_in_at ? `Checked in ${formatDateTime(item.checked_in_at)}` : `Ordered ${formatDateTime(item.ordered_at)}`}
              </Text>
              <Text style={styles.link}>View order →</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  rowText: { flex: 1, gap: theme.spacing.xs },
  pressed: { opacity: 0.6 },
  link: { color: theme.colors.primary, fontSize: theme.fontSize.small, fontWeight: "600" },
});
