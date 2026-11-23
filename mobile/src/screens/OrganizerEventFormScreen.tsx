import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { createEvent, updateEvent } from "../api/organizerSetup";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OrganizerChoices, OrganizerField, OrganizerForm, OrganizerTimeField } from "../components/OrganizerForm";
import { Screen } from "../components/Screen";
import { useManagedEvent, useOrganizerSave } from "../hooks/useOrganizerSetup";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import type { EventDetails, EventVisibility } from "../types/event";
import { eventDisplayStatus } from "../utils/eventTiming";
import { canEditSetup, changedSetupFields, EVENT_CATEGORIES, eventDraft, eventInput, type EventDraft } from "../utils/organizerSetup";

type NewProps = NativeStackScreenProps<OrganizerStackParamList, "NewEvent">;
type EditProps = NativeStackScreenProps<OrganizerStackParamList, "EditEvent">;
const visibilities: { value: EventVisibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

export function NewOrganizerEventScreen({ navigation }: NewProps) {
  return <EventEditor onBack={navigation.goBack} onSaved={(id) => navigation.replace("EventSetup", { eventId: id })} />;
}

export function EditOrganizerEventScreen({ route, navigation }: EditProps) {
  const resource = useManagedEvent(route.params.eventId);
  const event = resource.data;
  if (!event && resource.loading) return <Screen><LoadingState message="Loading event details…" /></Screen>;
  if (!event) return <Screen><ErrorState message={resource.error ?? "Event unavailable."} onRetry={resource.retry} /></Screen>;
  if (!canEditSetup(eventDisplayStatus(event))) {
    return <Screen><ErrorState title="Event is read-only" message="A completed, cancelled or suspended event cannot be edited." onRetry={resource.retry} /></Screen>;
  }
  return <EventEditor key={event.id} event={event} onBack={navigation.goBack} onSaved={() => navigation.goBack()}
    loadError={resource.error} checking={resource.loading || resource.refreshing} onRetry={resource.retry} />;
}

function EventEditor({ event, checking, loadError, onRetry, onBack, onSaved }: {
  event?: EventDetails; checking?: boolean; loadError?: string | null; onRetry?: () => void;
  onBack: () => void; onSaved: (id: string) => void;
}) {
  const [original] = useState(event);
  const [form, setForm] = useState(() => eventDraft(event));
  const [savedId, setSavedId] = useState<string | null>(null);
  const { busy, error, setError, save } = useOrganizerSave();
  const disabled = busy || !!savedId || !!checking || !!loadError;
  const categories = EVENT_CATEGORIES.includes(form.category) || !form.category
    ? EVENT_CATEGORIES : [...EVENT_CATEGORIES, form.category];

  useEffect(() => {
    if (savedId && !busy) onSaved(savedId);
  }, [busy, onSaved, savedId]);

  function field(key: Exclude<keyof EventDraft, "visibility">) {
    return { value: form[key], editable: !disabled, onChangeText: (value: string) => {
      setForm((previous) => ({ ...previous, [key]: value }));
      setError(null);
    } };
  }

  async function submit() {
    if (disabled) return;
    try {
      const input = eventInput(form, original);
      const changes = original && changedSetupFields(input, original);
      if (event && changes && !Object.keys(changes).length) { onBack(); return; }
      const result = await save(
        (token) => event && changes ? updateEvent(token, event.id, changes) : createEvent(token, input),
        event ? "Reload the event to check whether the changes were saved." : "Check My events for the draft before creating it again.",
      );
      if (result) setSavedId(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the event details.");
    }
  }

  return (
    <OrganizerForm error={error} submitTitle={event ? "Save event changes" : "Create draft event"}
      busy={busy} disabled={disabled} onSubmit={() => { void submit(); }} onBack={onBack}>
      {loadError && onRetry ? <ErrorState title="Couldn't refresh the event" message={loadError} onRetry={onRetry} /> : null}
      <Text style={sharedStyles.muted}>{event
        ? "Blank optional fields keep their saved values."
        : "Save a draft, add ticket types, then publish from Event setup."}</Text>
      <OrganizerField {...field("title")} label="Title" maxLength={200} />
      <OrganizerField {...field("venue_name")} label="Venue name" maxLength={200} />
      <OrganizerField {...field("venue_address")} label="Venue address (optional)" maxLength={300} />
      <OrganizerField {...field("capacity")} label="Event capacity" keyboardType="number-pad" maxLength={10} />
      <Text accessibilityRole="header" style={sharedStyles.title}>Event schedule</Text>
      <Text style={sharedStyles.muted}>Enter dates and times in Almaty time (UTC+5).</Text>
      <OrganizerTimeField {...field("start_time")} label="Starts" />
      <OrganizerTimeField {...field("end_time")} label="Ends (optional)" />
      <OrganizerTimeField {...field("registration_opens_at")} label="Registration opens (optional)" />
      <OrganizerTimeField {...field("registration_closes_at")} label="Registration closes (optional)" />
      <OrganizerChoices label="Category" value={form.category} disabled={disabled}
        choices={categories.map((value) => ({ value, label: value }))} onChange={field("category").onChangeText} />
      <OrganizerChoices label="Visibility" value={form.visibility} choices={visibilities} disabled={disabled}
        onChange={(visibility) => setForm((previous) => ({ ...previous, visibility }))} />
      <Text style={sharedStyles.muted}>Public events appear in the catalogue once published. Unlisted events require a link. Private events cannot be purchased by the public.</Text>
      <OrganizerField {...field("description")} label="Description (optional)" multiline maxLength={5000} />
      <OrganizerField {...field("refund_policy")} label="Refund policy (optional)" multiline maxLength={2000} />
      <OrganizerField {...field("image_url")} label="Image address (optional)" keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={500} />
    </OrganizerForm>
  );
}
