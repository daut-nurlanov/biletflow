import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { activatePaidSales, getActivationChecklist } from "../api/organizer";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import type { OrganizerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { formatMoney } from "../utils/formatting";
import { organizerMessage } from "../utils/organizerOrders";
import { activationState, isProfileStep } from "../utils/organizerSetup";

type Props = NativeStackScreenProps<OrganizerStackParamList, "PaidSalesActivation">;

export function PaidSalesActivationScreen({ route, navigation }: Props) {
  const { eventId, eventTitle } = route.params;
  const { authed } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getActivationChecklist(token, eventId, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed, eventId],
  );
  const resource = useApiResource(load);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  // A double tap must never pay the fee twice.
  const locked = useRef(false);

  const checklist = resource.data;
  if (!checklist && resource.loading) return <Screen><LoadingState message="Loading the checklist…" /></Screen>;
  if (!checklist) {
    return <Screen><ErrorState title="Couldn't load the checklist" message={resource.error ?? "Try again."} onRetry={resource.retry} /></Screen>;
  }

  const state = activationState(checklist);
  const fee = formatMoney(checklist.activation_fee);
  const profileIncomplete = checklist.items.some((item) => isProfileStep(item.key) && !item.done);

  async function activate() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await authed((token) => activatePaidSales(token, eventId));
      setNotice({ text: "Paid sales activated. Buyers can now pay for this event's tickets.", error: false });
    } catch (caught) {
      setNotice({
        text: `${organizerMessage(caught)} If the connection dropped, pull down on the dashboard to check before trying again.`,
        error: true,
      });
    } finally {
      // The answer can be lost after the server activated, so always reload the checklist.
      resource.refresh();
      setBusy(false);
      locked.current = false;
    }
  }

  function confirm() {
    Alert.alert(
      "Activate paid sales?",
      `The activation fee of ${fee} is simulated: no real money moves. Paid sales turn on for ${eventTitle}.`,
      [
        { text: "Back", style: "cancel" },
        { text: "Pay and activate", onPress: () => { void activate(); } },
      ],
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={sharedStyles.listContent}>
        <Text accessibilityRole="header" style={sharedStyles.title}>{eventTitle}</Text>
        {notice ? (
          <Text accessibilityRole="alert" style={notice.error ? formStyles.error : sharedStyles.body}>{notice.text}</Text>
        ) : null}

        {state.kind === "active" ? (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.title}>Paid sales are active</Text>
            <Text style={sharedStyles.body}>Buyers can pay for this event&apos;s paid ticket types.</Text>
          </View>
        ) : state.kind === "suspended" ? (
          <View style={sharedStyles.card}>
            <Text style={sharedStyles.title}>Paid sales suspended</Text>
            <Text style={sharedStyles.body}>BiletFlow suspended paid sales for this event. Contact support through the Support tab.</Text>
          </View>
        ) : (
          <>
            <Text style={sharedStyles.body}>
              {`Selling paid tickets needs a one-time activation. The fee is ${fee}, simulated: no real money moves.`}
            </Text>
            <View style={[sharedStyles.card, styles.list]} accessibilityRole="list">
              {checklist.items.map((item) => (
                <View key={item.key} style={styles.item} accessible accessibilityLabel={`${item.label}: ${item.done ? "done" : "not done"}`}>
                  <Text style={[styles.mark, item.done ? styles.done : styles.todo]}>{item.done ? "✓" : "○"}</Text>
                  <Text style={[sharedStyles.body, styles.flex]}>{item.label}</Text>
                </View>
              ))}
            </View>

            {state.kind === "no_paid_tickets" ? (
              <Text style={sharedStyles.muted}>This event has no paid ticket types yet. Free tickets don&apos;t need activation.</Text>
            ) : null}
            {profileIncomplete ? (
              <AppButton title="Open organizer profile" onPress={() => navigation.navigate("OrganizerProfile")} />
            ) : null}
            {state.kind === "blocked" ? (
              <Text style={sharedStyles.muted}>{`Still needed: ${state.missing.join("; ")}.`}</Text>
            ) : null}

            {state.kind === "ready" ? (
              <>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: terms, disabled: busy }}
                  disabled={busy}
                  onPress={() => setTerms((value) => !value)}
                  style={styles.terms}
                >
                  <View style={[styles.box, terms && styles.boxOn]}>
                    {terms ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                  <Text style={[sharedStyles.body, styles.flex]}>I accept the paid-event terms</Text>
                </Pressable>
                <AppButton title={busy ? "Activating…" : "Pay activation fee and activate"} onPress={confirm}
                  disabled={!terms} loading={busy} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: theme.spacing.sm },
  item: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  mark: { width: 24, fontSize: theme.fontSize.body, fontWeight: "700", textAlign: "center" },
  done: { color: theme.colors.primary },
  todo: { color: theme.colors.muted },
  terms: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  box: {
    width: 26, height: 26, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  boxOn: { backgroundColor: theme.colors.primary },
  tick: { color: theme.colors.surface, fontWeight: "800" },
});
