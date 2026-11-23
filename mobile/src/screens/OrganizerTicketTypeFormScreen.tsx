import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";

import { createTicketType, updateTicketType } from "../api/organizerSetup";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OrganizerField, OrganizerForm, OrganizerTimeField } from "../components/OrganizerForm";
import { Screen } from "../components/Screen";
import { useManagedEvent, useOrganizerSave } from "../hooks/useOrganizerSetup";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formStyles } from "../theme/forms";
import type { EventDetails } from "../types/event";
import type { TicketType } from "../types/ticket";
import { eventDisplayStatus } from "../utils/eventTiming";
import { canEditSetup, changedSetupFields, ticketTypeDraft, ticketTypeInput, type TicketTypeDraft } from "../utils/organizerSetup";

type Props = NativeStackScreenProps<OrganizerStackParamList, "TicketTypeForm">;

export function OrganizerTicketTypeFormScreen({ route, navigation }: Props) {
  const { eventId, ticketTypeId } = route.params;
  const resource = useManagedEvent(eventId);
  const event = resource.data;
  if (!event && resource.loading) return <Screen><LoadingState message="Loading ticket types…" /></Screen>;
  if (!event) return <Screen><ErrorState message={resource.error ?? "Event unavailable."} onRetry={resource.retry} /></Screen>;
  const type = event.ticket_types.find((item) => item.id === ticketTypeId);
  if (!canEditSetup(eventDisplayStatus(event)) || (ticketTypeId && !type)) {
    return <Screen><ErrorState message="This ticket type or event can no longer be edited." onRetry={resource.retry} /></Screen>;
  }
  return <TicketTypeEditor key={type?.id ?? event.id} event={event} type={type} onBack={navigation.goBack}
    loadError={resource.error} checking={resource.loading || resource.refreshing} onRetry={resource.retry} />;
}

function TicketTypeEditor({ event, type, checking, loadError, onRetry, onBack }: {
  event: EventDetails; type?: TicketType; checking: boolean; loadError: string | null;
  onRetry: () => void; onBack: () => void;
}) {
  const [original] = useState(type);
  const [form, setForm] = useState(() => ticketTypeDraft(event, type));
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, save } = useOrganizerSave();
  const disabled = busy || checking || !!loadError || saved;

  useEffect(() => {
    if (saved && !busy) onBack();
  }, [busy, onBack, saved]);

  function field(key: Exclude<keyof TicketTypeDraft, "is_hidden">) {
    return { value: form[key], editable: !disabled, onChangeText: (value: string) => {
      setForm((previous) => ({ ...previous, [key]: value }));
      setError(null);
    } };
  }

  async function submit() {
    if (disabled) return;
    try {
      const input = ticketTypeInput(form, event, original);
      const changes = original && changedSetupFields(input, { ...original, price: Number(original.price) });
      if (type && changes && !Object.keys(changes).length) { onBack(); return; }
      const result = await save(
        (token) => type && changes ? updateTicketType(token, type.id, changes) : createTicketType(token, event.id, input),
        "Check the ticket types in Event setup before trying again.",
      );
      if (result) setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the ticket type details.");
    }
  }

  return (
    <OrganizerForm error={error} submitTitle="Save ticket type" busy={busy} disabled={disabled}
      onSubmit={() => { void submit(); }} onBack={onBack}>
      {loadError ? <ErrorState title="Couldn't refresh ticket types" message={loadError} onRetry={onRetry} /> : null}
      <Text accessibilityRole="header" style={sharedStyles.title}>{event.title}</Text>
      <OrganizerField {...field("name")} label="Ticket type name" maxLength={100} />
      <OrganizerField {...field("price")} label="Price in KZT" keyboardType="decimal-pad" maxLength={12} />
      <Text style={sharedStyles.muted}>Set the price to 0 for free tickets.</Text>
      <OrganizerField {...field("total_quantity")} label="Total tickets" keyboardType="number-pad" maxLength={10} />
      {type ? <Text style={sharedStyles.muted}>{type.total_quantity - type.quantity_available} sold. Total includes tickets already sold.</Text> : null}
      <OrganizerField {...field("max_per_order")} label="Maximum per order" keyboardType="number-pad" maxLength={10} />
      <OrganizerField {...field("description")} label="Ticket description (optional)" multiline maxLength={500} />
      <Text accessibilityRole="header" style={sharedStyles.title}>Sales window</Text>
      <Text style={sharedStyles.muted}>Use Almaty time (UTC+5).{type ? " Blank optional fields keep their saved values." : ""}</Text>
      <OrganizerTimeField {...field("sales_start_time")} label="Sales start (optional)" />
      <OrganizerTimeField {...field("sales_end_time")} label="Sales end (optional)" />
      <View style={formStyles.row}>
        <Text style={sharedStyles.body}>Hide from buyers</Text>
        <Switch accessibilityLabel="Hide from buyers" value={form.is_hidden}
          onValueChange={(is_hidden) => setForm((previous) => ({ ...previous, is_hidden }))} disabled={disabled} />
      </View>
    </OrganizerForm>
  );
}
