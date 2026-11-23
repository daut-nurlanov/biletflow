import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";

import { cancelOrder, getMyOrders } from "../api/orders";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { RootTabParamList, TicketsStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formatDateTime, formatMoney } from "../utils/formatting";

type Props = CompositeScreenProps<NativeStackScreenProps<TicketsStackParamList, "OrderHistory">, BottomTabScreenProps<RootTabParamList, "MyTickets">>;

export function OrderHistoryScreen({ navigation }: Props) {
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getMyOrders(token, signal)), [authed]);
  const resource = useApiResource(load);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function askCancel(orderId: string, title: string) {
    Alert.alert("Cancel registration?", `Your tickets for ${title} will stop working.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel registration", style: "destructive", onPress: () => void doCancel(orderId, title) },
    ]);
  }

  async function doCancel(orderId: string, title: string) {
    if (cancelling) return;
    setCancelling(orderId); setMessage(null);
    try {
      await authed((token) => cancelOrder(token, orderId));
      setMessage(`Your registration for ${title} was cancelled.`);
      resource.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Couldn't cancel this registration.");
    } finally { setCancelling(null); }
  }

  return (
    <Screen>
      {resource.loading ? <LoadingState message="Loading purchases…" /> : resource.error ? (
        <ErrorState title="Couldn't load purchases" message={resource.error} onRetry={resource.retry} />
      ) : (
        <FlatList
          data={resource.data ?? []}
          keyExtractor={(order) => order.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          ListHeaderComponent={message ? <Text accessibilityRole="alert" style={sharedStyles.body}>{message}</Text> : undefined}
          ListEmptyComponent={<EmptyState title="No orders yet" message="Orders from this app and the website will appear here." />}
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{item.event_title}</Text>
              <StatusBadge status={item.status} />
              <Text style={sharedStyles.body}>{item.ticket_count} {item.ticket_count === 1 ? "ticket" : "tickets"} · Order total {formatMoney(item.total_amount)}</Text>
              {item.promo_code_applied ? <Text style={sharedStyles.body}>Promotion: {item.promo_code_applied}</Text> : null}
              <Text style={sharedStyles.muted}>Ordered {formatDateTime(item.created_at)}</Text>
              <Text selectable style={sharedStyles.muted}>Order reference: {item.id}</Text>
              {item.status === "paid" && Number(item.total_amount) === 0
                ? <AppButton title={cancelling === item.id ? "Cancelling…" : "Cancel registration"} loading={cancelling === item.id}
                    onPress={() => askCancel(item.id, item.event_title)} />
                : item.status === "paid" ? <Text style={sharedStyles.muted}>Paid orders are refunded by the organizer. Ask through support.</Text> : null}
              <AppButton title="Get help with this order" onPress={() => navigation.navigate("SupportTab", { screen: "SupportNew", params: { orderId: item.id } })} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
