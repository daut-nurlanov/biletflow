import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";

import { escalateSupportCase, getSupportCase, replyToSupport, setSupportStatus } from "../api/support";
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

type Props = NativeStackScreenProps<SupportStackParamList, "SupportThread">;
export function SupportThreadScreen({ route }: Props) {
  const { caseId } = route.params;
  const { state, authed } = useSession();
  const load = useCallback((signal: AbortSignal) => authed((token) => getSupportCase(token, caseId, signal)), [authed, caseId]);
  const resource = useApiResource(load, 10_000);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function act(call: (token: string) => Promise<unknown>, clearDraft = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await authed(call);
      if (clearDraft) setMessage("");
      resource.refresh();
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "The request failed."} Refresh the conversation before retrying if the connection was interrupted.`);
    } finally { lock.current = false; setBusy(false); }
  }
  function send() {
    if (!message.trim() || Array.from(message).length > 4000) { setError("Enter a reply of 1 to 4,000 characters."); return; }
    void act((token) => replyToSupport(token, caseId, message), true);
  }
  if (resource.loading) return <Screen><LoadingState message="Loading conversation…" /></Screen>;
  if (resource.error || !resource.data) return <Screen><ErrorState message={resource.error ?? "Request not found."} onRetry={resource.retry} /></Screen>;
  const data = resource.data;
  const handler = data.your_role_in_case === "handler" || data.your_role_in_case === "admin";
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <FlatList data={data.messages ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" refreshing={resource.refreshing} onRefresh={resource.refresh}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        <Text style={sharedStyles.title}>{supportLabel(data.category)}</Text>
        <Text style={sharedStyles.body}>{supportLabel(data.status)}{data.escalated ? " · Escalated to platform" : ""}</Text>
        <Text style={sharedStyles.muted}>Refreshes every 10 seconds while open.</Text>
        {handler ? <View style={styles.row}>{(["open", "in_progress", "waiting_customer", "resolved"] as SupportStatus[]).map((status) => (
          <AppButton key={status} title={supportLabel(status)} disabled={busy || data.status === status}
            onPress={() => { void act((token) => setSupportStatus(token, caseId, status)); }} />
        ))}</View> : null}
        {data.your_role_in_case === "handler" && !data.escalated ? <AppButton title="Escalate to platform" disabled={busy}
          onPress={() => Alert.alert("Escalate request?", "Ask the platform team to help with this attendee case?", [
            { text: "Cancel", style: "cancel" }, { text: "Escalate", onPress: () => { void act((token) => escalateSupportCase(token, caseId)); } },
          ])} /> : null}
      </View>}
      renderItem={({ item }) => <View style={sharedStyles.card}>
        <Text style={sharedStyles.title}>{item.sender_id === (state.status === "signedIn" ? state.user.id : "") ? "You" : item.sender_name ?? "Support"}</Text>
        <Text style={sharedStyles.body}>{item.message}</Text>
        <Text style={sharedStyles.muted}>{formatDateTime(item.created_at)}</Text>
      </View>}
      ListFooterComponent={<View style={{ gap: 12 }}>
        <TextInput accessibilityLabel="Reply message" style={[styles.input, styles.message]} multiline value={message}
          onChangeText={setMessage} editable={!busy} placeholder="Write a reply" />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <AppButton title={busy ? "Sending…" : "Send reply"} onPress={send} disabled={busy || resource.refreshing} loading={busy} />
      </View>} />
  </KeyboardAvoidingView></Screen>;
}
