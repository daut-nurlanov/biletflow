import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getMyOrders } from "../api/orders";
import { createSupportCase } from "../api/support";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { SupportStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formStyles as styles } from "../theme/forms";
import { SUPPORT_CATEGORIES, supportLabel, type SupportCategory } from "../types/support";
import { formatDateTime } from "../utils/formatting";

type Props = NativeStackScreenProps<SupportStackParamList, "SupportNew">;
export function SupportNewScreen({ route, navigation }: Props) {
  const { state, authed } = useSession();
  const context = route.params ?? {};
  const hasContext = !!(context.eventId || context.orderId || context.ticketId);
  const organizer = state.status === "signedIn" && state.user.role === "organizer";
  const [category, setCategory] = useState<SupportCategory>("ticket_delivery");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const load = useCallback((signal: AbortSignal) => authed((token) => getMyOrders(token, signal)), [authed]);
  const orders = useApiResource(load);

  async function submit() {
    if (locked.current) return;
    if (!message.trim() || Array.from(message).length > 4000) { setError("Write a message of 1 to 4,000 characters."); return; }
    if (!hasContext && !organizer && !orderId) { setError("Choose one of your orders, or open help from an event or ticket."); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      const created = await authed((token) => createSupportCase(token, category, message,
        hasContext ? context : orderId ? { orderId } : {}));
      navigation.replace("SupportThread", { caseId: created.id });
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Couldn't create the request."} If the connection was lost, refresh your request list before resending; it may have been received.`);
    } finally { locked.current = false; setBusy(false); }
  }
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={sharedStyles.body}>{hasContext ? "Your event, ticket or order will be linked automatically." : organizer ? "Ask the platform for help with your organizer account." : "Choose the order you need help with."}</Text>
      {!hasContext && !organizer ? orders.error ? <ErrorState message={orders.error} onRetry={orders.retry} /> : orders.loading ? (
        <Text style={sharedStyles.muted}>Loading your orders…</Text>
      ) : <View style={styles.row}>
        {orders.data?.length === 0 ? <Text style={sharedStyles.muted}>No orders yet. Open help from an event instead.</Text> : null}
        {orders.data?.map((order) => <Pressable key={order.id} accessibilityRole="radio" accessibilityState={{ checked: orderId === order.id }}
          disabled={busy} onPress={() => setOrderId(order.id)} style={[styles.choice, orderId === order.id && styles.selected]}>
          <Text style={sharedStyles.body}>{order.event_title ?? "Order"} · {formatDateTime(order.created_at)}</Text>
        </Pressable>)}
      </View> : null}
      <Text style={sharedStyles.title}>Category</Text>
      <View style={styles.row}>{SUPPORT_CATEGORIES.filter((c) => organizer || c !== "activation").map((value) => (
        <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: category === value }} disabled={busy}
          onPress={() => setCategory(value)} style={[styles.choice, category === value && styles.selected]}>
          <Text style={sharedStyles.body}>{supportLabel(value)}</Text>
        </Pressable>
      ))}</View>
      <TextInput accessibilityLabel="Support message" style={[styles.input, styles.message]} multiline value={message}
        editable={!busy} onChangeText={setMessage} placeholder="How can we help?" />
      <Text style={sharedStyles.muted}>{Array.from(message).length} / 4,000 characters</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppButton title={busy ? "Sending request…" : "Send support request"} onPress={() => { void submit(); }} loading={busy}
        disabled={busy || (!hasContext && !organizer && !orderId)} />
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
