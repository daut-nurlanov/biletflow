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
import { sharedStyles, theme } from "../theme";
import { formatDateTime, formatMoney } from "../utils/formatting";
import { useLocale } from "../i18n/LocaleContext";

type Props = CompositeScreenProps<NativeStackScreenProps<TicketsStackParamList, "OrderHistory">, BottomTabScreenProps<RootTabParamList, "MyTickets">>;

export function OrderHistoryScreen({ navigation }: Props) {
  const { lang, t: localize } = useLocale();
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getMyOrders(token, signal)), [authed]);
  const resource = useApiResource(load);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function askCancel(orderId: string, title: string) {
    Alert.alert(localize("Cancel registration?"), `Your tickets for ${title} will stop working.`, [
      { text: localize("Keep it"), style: "cancel" },
      { text: localize("Cancel registration"), style: "destructive", onPress: () => void doCancel(orderId, title) },
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
      {resource.loading ? <LoadingState message={localize("Loading purchases…")} /> : resource.error ? (
        <ErrorState title={localize("Couldn't load purchases")} message={resource.error} onRetry={resource.retry} />
      ) : (
        <FlatList
          data={resource.data ?? []}
          keyExtractor={(order) => order.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          ListHeaderComponent={message ? <Text accessibilityRole="alert" style={sharedStyles.body}>{message}</Text> : undefined}
          ListEmptyComponent={<EmptyState title={localize("No orders yet")} message={localize("Orders from this app and the website will appear here.")} />}
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{item.event_title}</Text>
              <StatusBadge status={item.status} />
              <View style={[sharedStyles.card, sharedStyles.accentCard]}>
                <Text style={sharedStyles.title}>{formatMoney(item.total_amount, lang)}</Text>
                <Text style={sharedStyles.muted}>{localize("{count} ticket(s)", { count: item.ticket_count })}</Text>
              </View>
              {item.promo_code_applied ? <Text style={sharedStyles.body}>{localize("Promotion:")} {item.promo_code_applied}</Text> : null}
              <Text style={sharedStyles.muted}>{localize("Ordered")} {formatDateTime(item.created_at, lang)}</Text>
              <Text selectable style={sharedStyles.muted}>{localize("Order reference:")} {item.id}</Text>
              {item.status === "paid" && Number(item.total_amount) === 0
                ? <AppButton title={cancelling === item.id ? localize("Cancelling…") : localize("Cancel registration")} variant="danger" loading={cancelling === item.id}
                    onPress={() => askCancel(item.id, item.event_title)} />
                : item.status === "paid" ? <Text style={sharedStyles.muted}>{localize("Paid orders are refunded by the organizer. Ask through support.")}</Text> : null}
              <View style={{ marginTop: theme.spacing.xs }}>
                <AppButton title={localize("Get help with this order")} variant="secondary" onPress={() => navigation.navigate("SupportTab", { screen: "SupportNew", params: { orderId: item.id } })} />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
