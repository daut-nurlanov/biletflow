import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";

import { assignSupportCase, escalateSupportCase, getSupportCase, replyToSupport, setSupportStatus } from "../api/support";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { SupportStackParamList } from "../navigation/types";
import { sharedStyles } from "../theme";
import { formStyles as styles } from "../theme/forms";
import { supportLabel, type SupportStatus } from "../types/support";
import { formatDateTime } from "../utils/formatting";
import { useLocale } from "../i18n/LocaleContext";

type Props = NativeStackScreenProps<SupportStackParamList, "SupportThread">;
export function SupportThreadScreen({ route }: Props) {
  const { lang, t: localize } = useLocale();
  const { caseId } = route.params;
  const { state, authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getSupportCase(token, caseId, signal)), [authed, caseId]);
  const resource = useApiResource(load, 10_000);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const draftAttempt = useRef<{ input: string; key: string } | null>(null);
  async function act(call: (token: string) => Promise<unknown>, clearDraft = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await authed(call);
      if (clearDraft) { draftAttempt.current = null; setMessage(""); }
      resource.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request failed.");
    } finally { lock.current = false; setBusy(false); }
  }
  function send() {
    if (!message.trim() || Array.from(message).length > 4000) { setError("Enter a reply of 1 to 4,000 characters."); return; }
    void act((token) => {
      const input = JSON.stringify([caseId, message.trim()]);
      if (draftAttempt.current?.input !== input) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
        draftAttempt.current = { input, key: randomUUID() };
      }
      return replyToSupport(token, caseId, message, draftAttempt.current.key);
    }, true);
  }
  if (resource.loading) return <Screen><LoadingState message={localize("Loading conversation…")} /></Screen>;
  if (resource.error || !resource.data) return <Screen><ErrorState message={resource.error ?? "Request not found."} onRetry={resource.retry} /></Screen>;
  const data = resource.data;
  const handler = data.your_role_in_case === "handler" || data.your_role_in_case === "admin";
  const assignee = data.assigned_to_name;
  const userId = state.status === "signedIn" && state.user.id;
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <FlatList data={data.messages ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshing={resource.refreshing} onRefresh={resource.refresh}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        <Text style={sharedStyles.title}>{localize(supportLabel(data.category))}</Text>
        <Text style={sharedStyles.body}>{localize(supportLabel(data.status))}{data.escalated ? ` · ${localize("Escalated to platform")}` : ""}</Text>
        {data.event_title ? <Text style={sharedStyles.muted}>{localize("Event:")} {data.event_title}</Text> : null}
        {assignee ? <Text style={sharedStyles.muted}>{localize("Assigned to:")} {assignee}</Text> : null}
        {handler && userId && data.assigned_to !== userId ? <AppButton title={localize("Assign to me")}
          variant="secondary" disabled={busy || resource.refreshing}
          onPress={() => void act((token) => assignSupportCase(token, caseId, userId))} /> : null}
        <Text style={sharedStyles.muted}>{localize("Refreshes every 10 seconds while open.")}</Text>
        {handler ? <View style={styles.row}>{(["open", "in_progress", "waiting_customer", "resolved"] as SupportStatus[]).map((status) => (
          <AppButton key={status} title={localize(supportLabel(status))} disabled={busy || data.status === status}
            onPress={() => { void act((token) => setSupportStatus(token, caseId, status)); }} />
        ))}</View> : null}
        {data.your_role_in_case === "handler" && !data.escalated ? <AppButton title={localize("Escalate to platform")} disabled={busy}
          onPress={() => Alert.alert(localize("Escalate request?"), localize("Ask the platform team to help with this attendee case?"), [
            { text: localize("Cancel"), style: "cancel" }, { text: localize("Escalate"), onPress: () => { void act((token) => escalateSupportCase(token, caseId)); } },
          ])} /> : null}
      </View>}
      renderItem={({ item }) => {
        const mine = state.status === "signedIn" && item.sender_id === state.user.id;
        return <View style={[sharedStyles.card, mine && sharedStyles.accentCard, {
          alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "94%", minWidth: "56%",
        }]}>
          <Text style={sharedStyles.title}>{mine ? localize("You") : item.sender_name ?? "Support"}</Text>
          <Text style={sharedStyles.body}>{item.message}</Text>
          <Text style={sharedStyles.muted}>{formatDateTime(item.created_at, lang)}</Text>
        </View>;
      }}
      ListFooterComponent={<View style={{ gap: 12 }}>
        <TextInput accessibilityLabel={localize("Reply message")} style={[styles.input, styles.message]} multiline value={message}
          onChangeText={setMessage} editable={!busy} placeholder={localize("Write a reply")} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{localize(error)}</Text> : null}
        <AppButton title={busy ? localize("Sending…") : localize("Send reply")} onPress={send} disabled={busy || resource.refreshing} loading={busy} />
      </View>} />
  </KeyboardAvoidingView></Screen>;
}
