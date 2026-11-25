import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useCallback, useRef, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

import { resendVerification, verifyEmail } from "../api/auth";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "../api/notifications";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { RootTabParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles as styles } from "../theme/forms";
import { formatDateTime } from "../utils/formatting";
import { useLocale } from "../i18n/LocaleContext";

/** In this demo every "email" is stored here, including the email verification code. */
export function NotificationsScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "NotificationsTab">) {
  const { lang, t: localize } = useLocale();
  const { state, authed, refreshUser } = useSession();
  const verified = state.status === "signedIn" ? state.user.is_email_verified : true;
  const role = state.status === "signedIn" ? state.user.role : undefined;
  const [unread, setUnread] = useState(false);
  const load = useCallback((signal: AbortSignal) => authed((token) => getNotifications(token, signal, unread)), [authed, unread]);
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

  function openRelated(item: AppNotification): (() => void) | undefined {
    const id = item.target_id;
    if (id && item.target_type === "support") return () => navigation.navigate("SupportTab", { screen: "SupportThread", params: { caseId: id } });
    if (id && item.target_type === "organizer_event" && role === "organizer") {
      return () => navigation.navigate("OrganizerTab", { screen: "EventDashboard", params: { eventId: id } });
    }
    if (id && item.target_type === "event" && role === "attendee") {
      return () => navigation.navigate("EventsTab", { screen: "EventDetails", params: { eventId: id } });
    }
    if (role === "attendee" && ["payment_failed", "order_confirmation", "refund_completed", "registration_cancelled", "event_cancelled"].includes(item.kind)) {
      const screen = item.kind === "payment_failed" ? "OrderHistory" : "TicketList";
      return () => navigation.navigate("MyTickets", { screen });
    }
  }

  function readItem(item: AppNotification, open?: () => void) {
    return run(async () => {
      if (!item.is_read) await authed((token) => markNotificationRead(token, item.id));
      resource.refresh();
      open?.();
    });
  }

  const header = (
    <View style={{ gap: 12 }}>
      {!verified && (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.title}>{localize("Verify your email")}</Text>
          <Text style={sharedStyles.body}>
            {localize("Organizers must verify their email before publishing events. Find the code in a message below, then enter it here.")}
          </Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={localize("Verification code")}
            placeholderTextColor="#6B7280" autoCapitalize="none" autoCorrect={false} accessibilityLabel={localize("Verification code")} editable={!busy} />
          <AppButton title={localize("Verify email")} disabled={!code.trim()} loading={busy} onPress={() => run(async () => {
            const result = await authed((token) => verifyEmail(token, code));
            setCode("");
            await refreshUser();
            resource.refresh();
            return result.message;
          })} />
          <AppButton title={localize("Send a new code")} disabled={busy} onPress={() => run(async () => {
            const result = await authed((token) => resendVerification(token));
            resource.refresh();
            return result.message;
          })} />
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={styles.error}>{localize(error)}</Text>}
      {info && <Text accessibilityRole="alert" style={sharedStyles.muted}>{localize(info)}</Text>}
      {resource.error && resource.data ? <ErrorState message={resource.error} onRetry={resource.retry} /> : null}
      <AppButton title={localize(unread ? "All notifications" : "Unread only")} variant="secondary" disabled={busy}
        onPress={() => setUnread((previous) => !previous)} />
      <AppButton title={localize("Mark all as read")} variant="secondary" disabled={busy || !(resource.data ?? []).some((n) => !n.is_read)}
        onPress={() => run(async () => { await authed((token) => markAllNotificationsRead(token)); resource.refresh(); })} />
    </View>
  );

  if (resource.loading) return <Screen><LoadingState message={localize("Loading notifications…")} /></Screen>;
  if (resource.error && !resource.data) return <Screen><ErrorState message={resource.error} onRetry={resource.retry} /></Screen>;

  return (
    <Screen>
      <FlatList data={resource.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={sharedStyles.listContent}
        refreshing={resource.refreshing} onRefresh={resource.refresh} ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState title={localize(unread ? "No unread notifications." : "No notifications")} message={localize("Purchases, refunds, event changes and codes appear here.")} />}
        renderItem={({ item }) => {
          const open = openRelated(item);
          return (
          <View style={[sharedStyles.card, !item.is_read && { borderLeftColor: theme.colors.primary, borderLeftWidth: 4 }]}>
            <Text style={sharedStyles.title}>{localize(item.subject)}</Text>
            <Text style={sharedStyles.muted}>{localize(item.is_read ? "Read" : "Unread")}</Text>
            <Text selectable style={sharedStyles.body}>{localize(item.body)}</Text>
            <Text style={sharedStyles.muted}>{formatDateTime(item.created_at, lang)}</Text>
            {(open || !item.is_read) && <AppButton variant="secondary" disabled={busy}
              accessibilityLabel={localize(open ? "Open related item: {subject}" : "Mark as read: {subject}", { subject: localize(item.subject) })}
              title={localize(open ? "Open related item" : "Mark as read")} onPress={() => void readItem(item, open)} />}
          </View>
          );
        }} />
    </Screen>
  );
}
