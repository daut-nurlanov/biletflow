import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { getEventOrders } from "../api/organizer";
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
import { formatDateTime, formatMoney } from "../utils/formatting";
import { organizerMessage } from "../utils/organizerOrders";
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventOrders">;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "paid", label: "Confirmed" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Payment failed" },
  { value: "pending", label: "Pending" },
] as const;

export function EventOrdersScreen({ route, navigation }: Props) {
  const { t: localize } = useLocale();
  const { lang } = useLocale();
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const [status, setStatus] = useState("");

  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getEventOrders(token, eventId, status, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, eventId, status],
  );
  const resource = useApiResource(load);
  const rows = resource.data ?? [];

  return (
    <Screen>
      <FlatList
        data={resource.loading || resource.error ? [] : rows}
        keyExtractor={(order) => order.id}
        contentContainerStyle={sharedStyles.listContent}
        refreshing={resource.refreshing}
        onRefresh={resource.refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
            <Text style={sharedStyles.muted}>{localize("Payments and refunds are simulated. No real money is charged.")}</Text>
            <FilterChips label={localize("Order status")} options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </View>
        }
        ListEmptyComponent={
          resource.loading ? <LoadingState message={localize("Loading orders…")} />
            : resource.error ? <ErrorState title={localize("Couldn't load orders")} message={resource.error} onRetry={resource.retry} />
              : <EmptyState title={localize("No orders")} message={status ? localize("No orders have this status.") : localize("Orders appear here once people buy or register.")} />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Order from ${item.full_name || item.email}, ${formatMoney(item.total_amount, lang)}. Opens the order`}
            onPress={() => navigation.navigate("OrderDetail", { orderId: item.id, eventId })}
            style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
          >
            <View style={styles.rowTop}>
              <View style={styles.rowText}>
                <Text style={sharedStyles.title}>{item.full_name || item.email}</Text>
                {item.full_name ? <Text style={sharedStyles.muted}>{item.email}</Text> : null}
              </View>
              <StatusBadge status={item.status} />
            </View>
            <Text style={sharedStyles.body}>
              {`${formatMoney(item.total_amount, lang)} · ${item.ticket_count} ${item.ticket_count === 1 ? "ticket" : "tickets"}`}
              {item.promo_code_applied ? ` · ${item.promo_code_applied}` : ""}
            </Text>
            <Text style={sharedStyles.muted}>{formatDateTime(item.created_at, lang)}</Text>
            <Text style={styles.link}>{localize("View order →")}</Text>
          </Pressable>
        )}
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
