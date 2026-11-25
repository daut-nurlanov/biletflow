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
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventSetup">;

const actions = {
  publish: { label: "Publish event", prompt: "Publish this event with its current visibility and ticket types?", success: "Event published." },
  unpublish: { label: "Unpublish event", prompt: "Move this event back to draft? This is only possible while it has no valid or checked-in tickets.", success: "Event moved back to draft." },
  cancel: { label: "Cancel event", prompt: "This stops sales and makes every ticket unusable at the door. Ticket holders are notified. Cancellation cannot be undone. Handle any refunds separately in Orders.", success: "Event cancelled. Ticket holders were notified." },
};

export function EventSetupScreen({ route, navigation }: Props) {
  const { lang, t: localize } = useLocale();
  const { eventId } = route.params;
  const resource = useManagedEvent(eventId);
  const { busy, error, save, setError } = useOrganizerSave();
  const [notice, setNotice] = useState<string | null>(null);
  const event = resource.data;

  function confirm(action: LifecycleAction) {
    if (disabled) return;
    const { label, prompt, success } = actions[action];
    Alert.alert(localize(label) + "?", localize(prompt), [
      { text: localize("Keep current status"), style: "cancel" },
      { text: localize(label), style: action === "cancel" ? "destructive" : "default", onPress: () => {
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

  if (!event && resource.loading) return <Screen><LoadingState message={localize("Loading event setup…")} /></Screen>;
  if (!event || resource.error) {
    return <Screen><ErrorState title={localize("Couldn't load event setup")} message={resource.error ?? "Event unavailable."} onRetry={resource.retry} /></Screen>;
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
          <Text style={sharedStyles.body}>{event.venue_name} · {formatDateTime(event.start_time, lang)}</Text>
          <Text style={sharedStyles.muted}>{localize("{offered} tickets configured · Capacity {capacity}", { offered, capacity: event.capacity })}</Text>
          {phase === "draft" ? <Text style={sharedStyles.muted}>{localize("Buyers can’t see this draft. Add a ticket type before publishing.")}</Text> : null}
          {!editable ? <Text style={sharedStyles.muted}>{localize("Event details and ticket types are read-only.")}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={sharedStyles.body}>{localize(notice)}</Text> : null}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={formStyles.error}>{localize(error)}</Text> : null}
          {busy ? <Text accessibilityLiveRegion="polite" style={sharedStyles.muted}>{localize("Saving event status…")}</Text> : null}
          {editable ? <AppButton title={localize("Edit event details")} disabled={disabled}
            onPress={() => { setError(null); navigation.navigate("EditEvent", { eventId }); }} /> : null}
          {lifecycleActions(phase).map((action) => (
            <AppButton key={action} title={localize(actions[action].label)} disabled={disabled}
              variant={action === "cancel" ? "danger" : action === "unpublish" ? "secondary" : "primary"}
              onPress={() => confirm(action)} />
          ))}
        </View>
        <Text accessibilityRole="header" style={sharedStyles.title}>{localize("Ticket types")}</Text>
        {editable ? <AppButton title={localize("Add ticket type")} disabled={disabled}
          onPress={() => { setError(null); navigation.navigate("TicketTypeForm", { eventId }); }} /> : null}
        {event.ticket_types.length === 0 ? <Text style={sharedStyles.muted}>{localize("No ticket types yet.")}</Text> : null}
        {event.ticket_types.map((type) => {
          const salesWindow = describeSalesWindow(type.sales_start_time, type.sales_end_time);
          return (
            <View style={sharedStyles.card} key={type.id}>
              <Text style={sharedStyles.title}>{type.name}</Text>
              <Text style={sharedStyles.body}>{localize("{price} · {remaining} left of {total}", {
                price: formatPrice(type.price, lang), remaining: type.quantity_available, total: type.total_quantity,
              })}</Text>
              <Text style={sharedStyles.muted}>{localize("Maximum {limit} per order · {visibility}", {
                limit: type.max_per_order, visibility: localize(type.is_hidden ? "Hidden from buyers" : "Visible to buyers"),
              })}</Text>
              {salesWindow ? <Text style={sharedStyles.muted}>{salesWindow}</Text> : null}
              {editable ? <AppButton title={localize("Edit ticket type")} variant="secondary" accessibilityLabel={localize("Edit {type}", { type: type.name })} disabled={disabled}
                onPress={() => { setError(null); navigation.navigate("TicketTypeForm", { eventId, ticketTypeId: type.id }); }} /> : null}
            </View>
          );
        })}
        {event.paid_sales_suspended ? <Text style={sharedStyles.muted}>{localize("Paid sales are suspended by BiletFlow.")}</Text> : null}
        {event.ticket_types.some((type) => Number(type.price) > 0) && !event.is_paid_sales_active && !event.paid_sales_suspended && phase !== "cancelled"
          ? <Text style={sharedStyles.muted}>{localize("Activate paid sales from the event dashboard before buyers can purchase paid tickets.")}</Text> : null}
      </ScrollView>
    </Screen>
  );
}
