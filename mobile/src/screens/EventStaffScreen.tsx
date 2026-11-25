import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";

import { assignExistingStaff, getEventStaff, revokeEventStaff } from "../api/staff";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import type { EventStaffAssignment } from "../types/event";
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<OrganizerStackParamList, "EventStaff">;

const assignmentLabels: Record<EventStaffAssignment["status"], string> = {
  active: "Active", invited: "Invited", revoked: "Access removed",
};

export function EventStaffScreen({ route }: Props) {
  const { t: localize } = useLocale();
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getEventStaff(token, eventId, signal)), [authed, eventId]);
  const resource = useApiResource(load);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = useRef(false);

  async function updateStaff(change: (token: string) => Promise<string>) {
    if (locked.current || resource.loading || resource.refreshing || resource.error) return;
    locked.current = true;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await authed(change));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't update door staff.");
    } finally {
      // A response can be lost after the server applied a change.
      resource.refresh();
      setBusy(false);
      locked.current = false;
    }
  }

  function assign() {
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/u.test(address) || address.length > 254) {
      setError("Enter a valid door staff email address.");
      return;
    }
    void updateStaff(async (token) => {
      const result = await assignExistingStaff(token, eventId, address);
      setEmail("");
      return result.already_assigned ? "This person is already assigned." : "Door staff assigned.";
    });
  }

  function confirmRemoval(staff: EventStaffAssignment) {
    Alert.alert(localize("Remove door access?"), `${staff.full_name} will no longer be able to check in tickets for this event.`, [
      { text: localize("Cancel"), style: "cancel" },
      { text: localize("Remove access"), style: "destructive", onPress: () => {
        void updateStaff(async (token) => {
          await revokeEventStaff(token, eventId, staff.id);
          return "Door access removed.";
        });
      } },
    ]);
  }

  if (!resource.data && resource.loading) return <Screen><LoadingState message={localize("Loading door staff…")} /></Screen>;
  if (resource.error || !resource.data) {
    return <Screen><ErrorState title={localize("Couldn't load door staff")} message={resource.error ?? "Try loading the assignments again."} onRetry={resource.retry} /></Screen>;
  }

  const disabled = busy || resource.loading || resource.refreshing;
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <FlatList
          data={resource.data}
          keyExtractor={(staff) => staff.id}
          contentContainerStyle={sharedStyles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          ListHeaderComponent={<View style={{ gap: theme.spacing.sm }}>
            <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
            <Text style={sharedStyles.body}>{localize("Assign an existing door staff account by email. Create new staff accounts on the website.")}</Text>
            <TextInput accessibilityLabel={localize("Door staff email")} placeholder={localize("Staff email address")} style={formStyles.input}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
              value={email} onChangeText={setEmail} editable={!busy} returnKeyType="done"
              onSubmitEditing={() => { if (!disabled) assign(); }} />
            <AppButton title={localize("Assign door staff")} onPress={assign} disabled={disabled} loading={busy} />
            {error ? <Text accessibilityRole="alert" style={formStyles.error}>{error}</Text> : null}
            {notice ? <Text accessibilityLiveRegion="polite" style={sharedStyles.body}>{notice}</Text> : null}
          </View>}
          ListEmptyComponent={<EmptyState title={localize("No door staff assigned")} message={localize("Assign an account above to give it access to this event.")} />}
          renderItem={({ item }) => (
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.title}>{item.full_name}</Text>
              <Text style={sharedStyles.body}>{item.email}</Text>
              <Text style={sharedStyles.muted}>{localize(assignmentLabels[item.status])}{item.is_suspended ? ` · ${localize("Account suspended")}` : ""}</Text>
              {item.status !== "revoked" ? <AppButton title={`Remove access for ${item.full_name}`} onPress={() => confirmRemoval(item)} disabled={disabled} /> : null}
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
