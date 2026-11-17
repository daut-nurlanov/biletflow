import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getEvent } from "../api/events";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import { useCheckout } from "../hooks/useCheckout";
import type { EventsStackParamList, RootTabParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formStyles as styles } from "../theme/forms";
import type { EventDetails } from "../types/event";
import { formatMoney, formatPrice } from "../utils/formatting";

type Props = CompositeScreenProps<NativeStackScreenProps<EventsStackParamList, "Checkout">, BottomTabScreenProps<RootTabParamList>>;

export function CheckoutScreen({ route, navigation }: Props) {
  const { state, authed } = useSession();
  const { eventId } = route.params;
  const load = useCallback((signal: AbortSignal) => authed((token) => getEvent(eventId, signal, token)), [authed, eventId]);
  const resource = useApiResource(load);
  if (resource.loading) return <Screen><LoadingState message="Loading ticket availability…" /></Screen>;
  if (resource.error || !resource.data) return <Screen><ErrorState message={resource.error ?? "Event not found."} onRetry={resource.retry} /></Screen>;
  return <CheckoutForm key={`${state.status === "signedIn" ? state.user.id : ""}:${eventId}`}
    event={resource.data} initialTypeId={route.params.ticketTypeId} initialCampaignToken={route.params.campaignToken}
    onTickets={() => navigation.navigate("MyTickets")} onRefreshAvailability={resource.refresh} />;
}

function CheckoutForm({ event, initialTypeId, initialCampaignToken, onTickets, onRefreshAvailability }: {
  event: EventDetails; initialTypeId?: string; initialCampaignToken?: string; onTickets: () => void; onRefreshAvailability: () => void;
}) {
  const checkout = useCheckout(event, initialTypeId, initialCampaignToken);
  const { form, change, attempt, busy, confirmation } = checkout;
  if (confirmation) return (
    <Screen><View style={styles.content}>
      <Text accessibilityRole="header" style={sharedStyles.title}>Purchase confirmed</Text>
      {confirmation.repeated ? <Text style={sharedStyles.body}>Your existing order was recovered. No additional purchase was made.</Text> : null}
      <Text style={sharedStyles.body}>{confirmation.tickets.length} ticket(s) issued for {event.title}.</Text>
      <Text style={sharedStyles.body}>Total: {formatMoney(confirmation.order.total_amount)}</Text>
      <Text style={sharedStyles.muted}>Order reference: {confirmation.order.id}</Text>
      <Text style={sharedStyles.muted}>Simulated payment. No real money was charged.</Text>
      <AppButton title="Open My Tickets" onPress={onTickets} />
    </View></Screen>
  );
  const locked = busy || !!attempt || !checkout.ready;
  return (
    <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={sharedStyles.title}>{event.title}</Text>
        <Text style={sharedStyles.muted}>Demo checkout. Payment is simulated; no card or real payment is collected.</Text>
        {!checkout.ready && !checkout.restoreError ? <LoadingState message="Checking interrupted purchases…" /> : null}
        {checkout.restoreError ? <ErrorState message={checkout.restoreError} onRetry={checkout.retryRestore} /> : null}
        {attempt ? <View style={sharedStyles.card}>
          <Text accessibilityRole="alert" style={sharedStyles.body}>An interrupted purchase is saved. Retry the same request safely, or check My Tickets. Choices stay locked until its outcome is confirmed.</Text>
          <Text style={sharedStyles.body}>{attempt.body.quantity} ticket(s) for {attempt.body.attendee_name}</Text>
          <Text style={sharedStyles.body}>{event.ticket_types.find((type) => type.id === attempt.body.ticket_type_id)?.name ?? "Previously selected ticket type"}</Text>
          {attempt.body.promo_code ? <Text style={sharedStyles.body}>Saved promo: {attempt.body.promo_code}</Text> : null}
        </View> : null}
        {event.ticket_types.filter((type) => !type.is_hidden).map((type) => (
          <Pressable key={type.id} accessibilityRole="radio" accessibilityState={{ checked: form.typeId === type.id, disabled: locked }}
            disabled={locked} onPress={() => change({ typeId: type.id, quantity: 1 })}
            style={[styles.choice, form.typeId === type.id && styles.selected, locked && styles.disabled]}>
            <Text style={sharedStyles.title}>{type.name}</Text>
            <Text style={sharedStyles.body}>{formatPrice(type.price)} · {type.quantity_available} remaining · maximum {type.max_per_order} per order</Text>
          </Pressable>
        ))}
        <Text style={sharedStyles.body}>Quantity</Text>
        <View style={styles.row}>
          <AppButton title="−" disabled={locked} onPress={() => change({ quantity: Math.max(1, (form.quantity || 1) - 1) })} />
          <TextInput accessibilityLabel="Ticket quantity" style={[styles.input, { flex: 1 }]} keyboardType="number-pad"
            value={Number.isNaN(form.quantity) ? "" : String(form.quantity)} editable={!locked}
            onChangeText={(text) => change({ quantity: text.trim() ? Number(text) : NaN })} />
          <AppButton title="+" disabled={locked} onPress={() => change({ quantity: (form.quantity || 0) + 1 })} />
        </View>
        <Text style={sharedStyles.body}>Name on tickets (required, up to 120 characters)</Text>
        <TextInput accessibilityLabel="Name on tickets" style={styles.input} value={form.name} editable={!locked}
          maxLength={120} onChangeText={(name) => change({ name })} autoComplete="name" />
        <Text style={sharedStyles.body}>Promo code or campaign link</Text>
        <TextInput accessibilityLabel="Promo code or campaign link" style={styles.input} value={checkout.promoInput} editable={!locked}
          autoCapitalize="none" autoCorrect={false} onChangeText={checkout.changePromo} />
        <Text style={sharedStyles.muted}>Changes automatically recalculate your quote. Clear the field or remove the promotion to pay the regular price.</Text>
        <AppButton title={checkout.applying ? "Applying promotion…" : "Apply promotion"} loading={checkout.applying} disabled={locked}
          onPress={() => { void checkout.applyPromo(checkout.promoInput); }} />
        {checkout.promoInput || form.promo || checkout.promoError || checkout.applying ? <AppButton title="Remove promotion" disabled={locked}
          onPress={() => { void checkout.applyPromo(""); }} /> : null}
        {checkout.promoPending ? <Text style={sharedStyles.muted}>Waiting for your promotion edit…</Text> : null}
        {checkout.promoError ? <Text accessibilityRole="alert" style={styles.error}>{checkout.promoError}</Text> : null}
        {checkout.promoNote ? <Text style={sharedStyles.body}>{checkout.promoNote}</Text> : null}
        {checkout.invalid && !attempt ? <Text accessibilityRole="alert" style={styles.error}>{checkout.invalid}</Text> : null}
        {!attempt && checkout.quotes.loading && !checkout.invalid ? <LoadingState message="Calculating quote…" /> : null}
        {checkout.quotes.error && !checkout.promoError && !attempt ? <Text accessibilityRole="alert" style={styles.error}>{checkout.quotes.error}</Text> : null}
        {checkout.reviewed && !checkout.quotes.loading && !checkout.quotes.error && !attempt ? <View style={sharedStyles.card}>
          <Text style={sharedStyles.body}>Subtotal: {formatMoney(checkout.reviewed.value.subtotal)}</Text>
          <Text style={sharedStyles.body}>Discount: {formatMoney(checkout.reviewed.value.discount)}</Text>
          <Text style={sharedStyles.title}>Total: {formatMoney(checkout.reviewed.value.total)}</Text>
          <Text style={sharedStyles.muted}>Processing fee: {formatMoney(checkout.reviewed.value.processing_fee)} — paid by the organizer, not added to your total.</Text>
        </View> : null}
        {checkout.expired && !attempt ? <Text accessibilityRole="alert" style={styles.error}>Quote expired. Refresh it to review current availability and price.</Text> : null}
        {!attempt ? <AppButton title="Refresh quote and availability" disabled={busy || checkout.applying || checkout.promoPending}
          onPress={() => { checkout.quotes.retry(); onRefreshAvailability(); }} /> : null}
        {checkout.error ? <Text accessibilityRole="alert" style={styles.error}>{checkout.error}</Text> : null}
        <AppButton title={busy ? "Confirming purchase…" : attempt ? "Retry saved purchase safely" : "Buy tickets (simulated)"}
          onPress={() => { void checkout.purchase(); }} disabled={!checkout.canBuy} loading={busy} />
        <AppButton title="Check My Tickets" onPress={onTickets} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView></Screen>
  );
}
