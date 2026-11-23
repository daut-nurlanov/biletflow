import { useCallback, useRef, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

import { resendVerification, verifyEmail } from "../api/auth";
import { getNotifications, markAllNotificationsRead } from "../api/notifications";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles } from "../theme";
import { formStyles as styles } from "../theme/forms";
import { formatDateTime } from "../utils/formatting";

/** In this demo every "email" is stored here, including the email verification code. */
export function NotificationsScreen() {
  const { state, authed, refreshUser } = useSession();
  const verified = state.status === "signedIn" ? state.user.is_email_verified : true;
  const load = useCallback((signal: AbortSignal) => authed((token) => getNotifications(token, signal)), [authed]);
  const resource = useApiResource(load);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  async function run(action: () => Promise<string | void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); setInfo(null);
    try {
      const message = await action();
      if (message) setInfo(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally { locked.current = false; setBusy(false); }
  }

  const header = (
    <View style={{ gap: 12 }}>
      {!verified && (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.title}>Verify your email</Text>
          <Text style={sharedStyles.body}>
            Organizers must verify their email before publishing events. Find the code in a message below, then enter it here.
          </Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Verification code"
            placeholderTextColor="#6B7280" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Verification code" editable={!busy} />
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {info && <Text accessibilityRole="alert" style={sharedStyles.muted}>{info}</Text>}
          <AppButton title="Verify email" disabled={!code.trim()} loading={busy} onPress={() => run(async () => {
            const result = await authed((token) => verifyEmail(token, code));
            setCode("");
            await refreshUser();
            resource.refresh();
            return result.message;
          })} />
          <AppButton title="Send a new code" disabled={busy} onPress={() => run(async () => {
            const result = await authed((token) => resendVerification(token));
            resource.refresh();
            return result.message;
          })} />
        </View>
      )}
      <AppButton title="Mark all as read" disabled={busy || !(resource.data ?? []).some((n) => !n.is_read)}
        onPress={() => run(async () => { await authed((token) => markAllNotificationsRead(token)); resource.refresh(); })} />
    </View>
  );

  if (resource.loading) return <Screen><LoadingState message="Loading notifications…" /></Screen>;
  if (resource.error && !resource.data) return <Screen><ErrorState message={resource.error} onRetry={resource.retry} /></Screen>;

  return (
    <Screen>
      <FlatList data={resource.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={sharedStyles.listContent}
        refreshing={resource.refreshing} onRefresh={resource.refresh} ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState title="No notifications" message="Purchases, refunds, event changes and codes appear here." />}
        renderItem={({ item }) => (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.title}>{item.subject}{item.is_read ? "" : " · new"}</Text>
            <Text selectable style={sharedStyles.body}>{item.body}</Text>
            <Text style={sharedStyles.muted}>{formatDateTime(item.created_at)}</Text>
          </View>
        )} />
    </Screen>
  );
}
