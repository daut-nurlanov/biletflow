import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { cancelRegistration, getOrderDetail, refundOrder } from "../api/organizer";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { formatDateTime, formatMoney } from "../utils/formatting";
import { orderAction, organizerMessage, seatLabel } from "../utils/organizerOrders";

type Props = NativeStackScreenProps<OrganizerStackParamList, "OrderDetail">;

export function OrderDetailScreen({ route }: Props) {
  const { orderId, eventId } = route.params;
  const { authed } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getOrderDetail(token, orderId, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, orderId],
  );
  const resource = useApiResource(load);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  // A second tap before the first answer must never send a second refund.
  const locked = useRef(false);

  const order = resource.data;
  if (!order && resource.loading) return <Screen><LoadingState message="Loading order…" /></Screen>;
  if (!order) {
    return <Screen><ErrorState title="Couldn't load this order" message={resource.error ?? "Order not found."} onRetry={resource.retry} /></Screen>;
  }
  if (order.event_id !== eventId) {
    return <Screen><ErrorState title="Different event" message="This order belongs to another event." onRetry={resource.retry} /></Screen>;
  }

  const action = orderAction(order);
  const ticketWord = order.tickets.length === 1 ? "ticket" : "tickets";

  async function run() {
    if (locked.current || action.kind === "none") return;
    locked.current = true;
    setBusy(true);
    setNotice(null);
    try {
      if (action.kind === "refund") {
        await authed((token) => refundOrder(token, orderId, reason.trim() || null));
        setNotice({ text: "Simulated refund completed. The tickets no longer work.", error: false });
      } else {
        await authed((token) => cancelRegistration(token, orderId));
        setNotice({ text: "Registration cancelled. The tickets no longer work.", error: false });
      }
      setReason("");
    } catch (caught) {
      setNotice({
        text: `${organizerMessage(caught)} If the connection dropped, pull down to refresh and check the status before trying again.`,
        error: true,
      });
    } finally {
      // The answer can be lost after the server applied it, so always reload.
      resource.refresh();
      setBusy(false);
      locked.current = false;
    }
  }

  function confirm() {
    if (!order || action.kind === "none") return;
    const refund = action.kind === "refund";
    Alert.alert(
      refund ? "Refund this order?" : "Cancel this registration?",
      `${order.tickets.length} ${ticketWord} will stop working and go back on sale.${refund ? ` ${formatMoney(order.total_amount)} is refunded (simulated, no real money moves).` : ""}`,
      [
        { text: "Back", style: "cancel" },
        { text: refund ? "Refund" : "Cancel registration", style: "destructive", onPress: () => { void run(); } },
      ],
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={sharedStyles.listContent} keyboardShouldPersistTaps="handled">
          <View style={sharedStyles.card}>
            <View style={styles.rowTop}>
              <Text style={[sharedStyles.title, styles.flex]}>{formatMoney(order.total_amount)}</Text>
              <StatusBadge status={order.status} />
            </View>
            <Text style={sharedStyles.body}>{formatDateTime(order.created_at)}</Text>
            <Text style={sharedStyles.body}>{`Promo code: ${order.promo_code_applied || "none"}`}</Text>
            <Text style={sharedStyles.muted} selectable>{`Order ${order.id}`}</Text>
            <Text style={sharedStyles.muted}>Demo order. All payments and refunds are simulated.</Text>
          </View>

          {notice ? (
            <Text accessibilityRole="alert" style={notice.error ? formStyles.error : sharedStyles.body}>{notice.text}</Text>
          ) : null}

          <Text accessibilityRole="header" style={sharedStyles.title}>{`${order.tickets.length} ${ticketWord}`}</Text>
          {order.tickets.map((ticket) => {
            const seat = seatLabel(ticket);
            return (
              <View key={ticket.id} style={sharedStyles.card}>
                <View style={styles.rowTop}>
                  <Text style={[sharedStyles.body, styles.flex, styles.strong]}>{ticket.attendee_name}</Text>
                  <StatusBadge status={ticket.status} />
                </View>
                <Text style={sharedStyles.muted}>{[ticket.ticket_type_name, seat && `Seat ${seat}`].filter(Boolean).join(" · ")}</Text>
              </View>
            );
          })}

          {action.kind === "none" && action.reason ? <Text style={sharedStyles.muted}>{action.reason}</Text> : null}

          {action.kind === "refund" ? (
            <View style={styles.action}>
              <Text style={sharedStyles.body} nativeID="refundReasonLabel">Refund reason (optional)</Text>
              <TextInput
                accessibilityLabelledBy="refundReasonLabel"
                style={[formStyles.input, formStyles.message]}
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={1000}
                editable={!busy}
                placeholder="For example: attendee can't come"
                placeholderTextColor={theme.colors.muted}
              />
              <AppButton title={busy ? "Refunding…" : "Refund order"} onPress={confirm} loading={busy} />
            </View>
          ) : null}
          {action.kind === "cancel" ? (
            <AppButton title={busy ? "Cancelling…" : "Cancel registration"} onPress={confirm} loading={busy} />
          ) : null}

          {order.refunds.length > 0 ? (
            <View style={sharedStyles.card}>
              <Text accessibilityRole="header" style={sharedStyles.title}>Refund history</Text>
              {order.refunds.map((refund) => (
                <View key={refund.id}>
                  <Text style={sharedStyles.body}>{`${formatMoney(refund.amount)} · ${formatDateTime(refund.created_at)}`}</Text>
                  <Text style={sharedStyles.muted}>{refund.reason || "No reason given"}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  strong: { fontWeight: "600" },
  action: { gap: theme.spacing.sm },
});
