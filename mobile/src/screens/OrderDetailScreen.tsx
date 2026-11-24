import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { cancelRegistration, getOrderDetail, refundOrder } from "../api/organizer";
import { ApiError } from "../api/client";
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
  const [revision, setRevision] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getOrderDetail(token, orderId, signal))
      .then((order) => ({ order, revision }))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, orderId, revision],
  );
  const resource = useApiResource(load);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<
    { kind: "success" | "error"; text: string } | { kind: "uncertain"; action: "refund" | "cancel" } | null
  >(null);
  // One write per status check, including taps on an already-open confirmation.
  const submittedRevision = useRef(-1);

  const order = resource.data?.order;
  if (!order && resource.loading) return <Screen><LoadingState message="Loading order…" /></Screen>;
  if (!order) {
    return <Screen><ErrorState title="Couldn't load this order" message={resource.error ?? "Order not found."} onRetry={resource.retry} /></Screen>;
  }
  if (order.id !== orderId || order.event_id !== eventId) {
    return <Screen><ErrorState title="Different event" message="This order belongs to another event." onRetry={resource.retry} /></Screen>;
  }

  const action = orderAction(order);
  const ticketCount = order.tickets.length;
  const ticketWord = ticketCount === 1 ? "ticket" : "tickets";
  const total = formatMoney(order.total_amount);
  const checking = resource.loading || resource.refreshing;
  const statusCurrent = !checking && !resource.error && resource.data?.revision === revision;
  const actionsDisabled = busy || !statusCurrent;
  const uncertain = notice?.kind === "uncertain";
  const confirmedOutcome = uncertain && statusCurrent &&
    order.status === (notice.action === "refund" ? "refunded" : "cancelled");
  const noticeText = uncertain
    ? confirmedOutcome
      ? `Order refreshed. The server confirmed the ${notice.action === "refund" ? "refund" : "cancellation"}.`
      : statusCurrent
        ? "Order status refreshed. Review the current status and available actions."
        : "The outcome is unknown. Refresh the order to confirm its status before trying again."
    : notice?.text;

  async function run() {
    if (actionsDisabled || submittedRevision.current >= revision || action.kind === "none") return;
    submittedRevision.current = revision;
    setBusy(true);
    setNotice(null);
    try {
      if (action.kind === "refund") {
        await authed((token) => refundOrder(token, orderId, reason.trim() || null));
        setNotice({ kind: "success", text: "Simulated refund completed. The tickets no longer work." });
      } else {
        await authed((token) => cancelRegistration(token, orderId));
        setNotice({ kind: "success", text: "Registration cancelled. The tickets no longer work." });
      }
      setReason("");
    } catch (caught) {
      setNotice(caught instanceof ApiError && caught.status < 500 && caught.status !== 408
        ? { kind: "error", text: organizerMessage(caught) }
        : { kind: "uncertain", action: action.kind });
    } finally {
      // The new loader aborts older reads and checks the order after this write.
      setRevision((previous) => previous + 1);
      setBusy(false);
    }
  }

  function confirm() {
    if (actionsDisabled || action.kind === "none") return;
    const refund = action.kind === "refund";
    Alert.alert(
      refund ? "Refund this order?" : "Cancel this registration?",
      `${ticketCount} ${ticketWord} will stop working and go back on sale.${refund ? ` ${total} is refunded (simulated, no real money moves).` : ""}`,
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
              <Text style={[sharedStyles.title, styles.flex]}>{total}</Text>
              <StatusBadge status={order.status} />
            </View>
            <Text style={sharedStyles.body}>{formatDateTime(order.created_at)}</Text>
            <Text style={sharedStyles.body}>{`Promo code: ${order.promo_code_applied || "none"}`}</Text>
            <Text style={sharedStyles.muted} selectable>{`Order ${order.id}`}</Text>
            <Text style={sharedStyles.muted}>Demo order. All payments and refunds are simulated.</Text>
          </View>

          {noticeText ? (
            <Text accessibilityRole="alert"
              style={notice?.kind === "error" || (uncertain && !statusCurrent) ? formStyles.error : sharedStyles.body}>{noticeText}</Text>
          ) : null}
          {resource.error ? <Text accessibilityRole="alert" style={formStyles.error}>{resource.error}</Text> : null}
          {!statusCurrent && !busy
            ? <Text style={sharedStyles.muted}>Showing the last known order status.</Text> : null}
          <AppButton title={checking ? "Refreshing order…" : "Refresh order"}
            accessibilityLabel="Refresh order" onPress={resource.refresh} disabled={busy} loading={checking} />

          <Text accessibilityRole="header" style={sharedStyles.title}>{`${ticketCount} ${ticketWord}`}</Text>
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
              <AppButton title={busy ? "Refunding…" : "Refund order"} onPress={confirm} disabled={actionsDisabled} loading={busy} />
            </View>
          ) : null}
          {action.kind === "cancel" ? (
            <AppButton title={busy ? "Cancelling…" : "Cancel registration"} onPress={confirm}
              disabled={actionsDisabled} loading={busy} />
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
