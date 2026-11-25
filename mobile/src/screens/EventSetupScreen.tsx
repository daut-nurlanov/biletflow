import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";

import { changeEventStatus } from "../api/organizerSetup";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { StatusBadge } from "../components/StatusBadge";
import { useManagedEvent, useOrganizerSave } from "../hooks/useOrganizerSetup";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formStyles } from "../theme/forms";
import type { LifecycleAction } from "../types/organizerSetup";
import { eventDisplayStatus } from "../utils/eventTiming";
import { formatDateTime, formatPrice } from "../utils/formatting";
import { canEditSetup, lifecycleActions } from "../utils/organizerSetup";
import { describeSalesWindow } from "../utils/ticketSales";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventSetup">;

const actions = {
  publish: { label: "Publish event", prompt: "Publish this event with its current visibility and ticket types?", success: "Event published." },
  unpublish: { label: "Unpublish event", prompt: "Move this event back to draft? This is only possible while it has no valid or checked-in tickets.", success: "Event moved back to draft." },
  cancel: { label: "Cancel event", prompt: "This stops sales and makes every ticket unusable at the door. Ticket holders are notified. Cancellation cannot be undone. Handle refunds separately on the website.", success: "Event cancelled. Ticket holders were notified." },
};

export function EventSetupScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const resource = useManagedEvent(eventId);
  const { busy, error, save, setError } = useOrganizerSave();
  const [notice, setNotice] = useState<string | null>(null);
  const event = resource.data;

  function confirm(action: LifecycleAction) {
    if (disabled) return;
    const { label, prompt, success } = actions[action];
    Alert.alert(label + "?", prompt, [
      { text: "Keep current status", style: "cancel" },
      { text: label, style: action === "cancel" ? "destructive" : "default", onPress: () => {
        void (async () => {
          setNotice(null);
          const updated = await save((token) => changeEventStatus(token, eventId, action),
            "Refresh Event setup to check the current status before trying again.");
          if (updated) {
            setNotice(success);
            resource.refresh();
          }
        })();
      } },
    ]);
  }

  if (!event && resource.loading) return <Screen><LoadingState message="Loading event setup…" /></Screen>;
  if (!event || resource.error) {
    return <Screen><ErrorState title="Couldn't load event setup" message={resource.error ?? "Event unavailable."} onRetry={resource.retry} /></Screen>;
  }
  const phase = eventDisplayStatus(event);
  const disabled = busy || resource.loading || resource.refreshing;
  const editable = canEditSetup(phase);
  const offered = event.ticket_types.reduce((count, type) => count + type.total_quantity, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={formStyles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => { if (!busy) resource.refresh(); }} />}>
        <View style={sharedStyles.card}>
          <Text accessibilityRole="header" style={sharedStyles.title}>{event.title}</Text>
          <StatusBadge status={phase} />
          <Text style={sharedStyles.body}>{event.venue_name} · {formatDateTime(event.start_time)}</Text>
          <Text style={sharedStyles.muted}>{offered} tickets configured · Capacity {event.capacity}</Text>
          {phase === "draft" ? <Text style={sharedStyles.muted}>Buyers can’t see this draft. Add a ticket type before publishing.</Text> : null}
          {!editable ? <Text style={sharedStyles.muted}>Event details and ticket types are read-only.</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={sharedStyles.body}>{notice}</Text> : null}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={formStyles.error}>{error}</Text> : null}
          {busy ? <Text accessibilityLiveRegion="polite" style={sharedStyles.muted}>Saving event status…</Text> : null}
          {editable ? <AppButton title="Edit event details" disabled={disabled}
            onPress={() => { setError(null); navigation.navigate("EditEvent", { eventId }); }} /> : null}
          {lifecycleActions(phase).map((action) => (
            <AppButton key={action} title={actions[action].label} disabled={disabled}
              variant={action === "cancel" ? "danger" : action === "unpublish" ? "secondary" : "primary"}
              onPress={() => confirm(action)} />
          ))}
        </View>
        <Text accessibilityRole="header" style={sharedStyles.title}>Ticket types</Text>
        {editable ? <AppButton title="Add ticket type" disabled={disabled}
          onPress={() => { setError(null); navigation.navigate("TicketTypeForm", { eventId }); }} /> : null}
        {event.ticket_types.length === 0 ? <Text style={sharedStyles.muted}>No ticket types yet.</Text> : null}
        {event.ticket_types.map((type) => {
          const salesWindow = describeSalesWindow(type.sales_start_time, type.sales_end_time);
          return (
            <View style={sharedStyles.card} key={type.id}>
              <Text style={sharedStyles.title}>{type.name}</Text>
              <Text style={sharedStyles.body}>{formatPrice(type.price)} · {type.quantity_available} left of {type.total_quantity}</Text>
              <Text style={sharedStyles.muted}>Maximum {type.max_per_order} per order · {type.is_hidden ? "Hidden from buyers" : "Visible to buyers"}</Text>
              {salesWindow ? <Text style={sharedStyles.muted}>{salesWindow}</Text> : null}
              {editable ? <AppButton title="Edit ticket type" variant="secondary" accessibilityLabel={`Edit ${type.name}`} disabled={disabled}
                onPress={() => { setError(null); navigation.navigate("TicketTypeForm", { eventId, ticketTypeId: type.id }); }} /> : null}
            </View>
          );
        })}
        {event.paid_sales_suspended ? <Text style={sharedStyles.muted}>Paid sales are suspended by BiletFlow.</Text> : null}
        {event.ticket_types.some((type) => Number(type.price) > 0) && !event.is_paid_sales_active && !event.paid_sales_suspended && phase !== "cancelled"
          ? <Text style={sharedStyles.muted}>Activate paid sales from the event dashboard before buyers can purchase paid tickets.</Text> : null}
      </ScrollView>
    </Screen>
  );
}
