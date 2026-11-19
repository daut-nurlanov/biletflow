import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { FlatList, Text, View } from "react-native";

import { getMyOrders } from "../api/orders";
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
          ListEmptyComponent={<EmptyState title="No orders yet" message="Orders from this app and the website will appear here." />}
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{item.event_title}</Text>
              <StatusBadge status={item.status} />
              <Text style={sharedStyles.body}>{item.ticket_count} {item.ticket_count === 1 ? "ticket" : "tickets"} · Order total {formatMoney(item.total_amount)}</Text>
              {item.promo_code_applied ? <Text style={sharedStyles.body}>Promotion: {item.promo_code_applied}</Text> : null}
              <Text style={sharedStyles.muted}>Ordered {formatDateTime(item.created_at)}</Text>
              <Text selectable style={sharedStyles.muted}>Order reference: {item.id}</Text>
              <AppButton title="Get help with this order" onPress={() => navigation.navigate("SupportTab", { screen: "SupportNew", params: { orderId: item.id } })} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
