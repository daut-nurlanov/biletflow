import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getOrganizerProfile, updateOrganizerProfile, verifyOrganizerProfile } from "../api/organizer";
import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";
import { useApiResource } from "../hooks/useApiResource";
import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { organizerMessage } from "../utils/organizerOrders";
import { canVerify, PAYOUT_MAX, PHONE_MAX, profileInput } from "../utils/organizerProfile";

export function OrganizerProfileScreen() {
  const { authed } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => authed((token) => getOrganizerProfile(token, signal))
      .catch((error: unknown) => { throw new Error(organizerMessage(error)); }),
    [authed],
  );
  const resource = useApiResource(load);
  const profile = resource.data;

  const [phone, setPhone] = useState("");
  const [payout, setPayout] = useState("");
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const locked = useRef(false);
  // Fill the form once from the server, without wiping what the person is typing on later refreshes.
  const filled = useRef(false);

  useEffect(() => {
    if (!profile || filled.current) return;
    filled.current = true;
    setPhone(profile.contact_phone ?? "");
    setPayout(profile.payout_account_details ?? "");
  }, [profile]);

  if (!profile && resource.loading) return <Screen><LoadingState message="Loading your profile…" /></Screen>;
  if (!profile) {
    return <Screen><ErrorState title="Couldn't load your profile" message={resource.error ?? "Try again."} onRetry={resource.retry} /></Screen>;
  }

  const unsaved = phone.trim() !== (profile.contact_phone ?? "").trim()
    || payout.trim() !== (profile.payout_account_details ?? "").trim();

  async function run(kind: "save" | "verify", task: (token: string) => Promise<string>) {
    if (locked.current) return;
    locked.current = true;
    Keyboard.dismiss();
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ text: await authed(task), error: false });
    } catch (caught) {
      setNotice({ text: organizerMessage(caught), error: true });
    } finally {
      resource.refresh();
      setBusy(null);
      locked.current = false;
    }
  }

  function save() {
    const checked = profileInput(phone, payout);
    if ("error" in checked) {
      setNotice({ text: checked.error, error: true });
      return;
    }
    void run("save", async (token) => {
      const saved = await updateOrganizerProfile(token, checked.input);
      setPhone(saved.contact_phone ?? "");
      setPayout(saved.payout_account_details ?? "");
      return "Profile saved.";
    });
  }

  function verify() {
    void run("verify", async (token) => {
      await verifyOrganizerProfile(token);
      return "Identity verified (simulated). You can now activate paid sales on your events.";
    });
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={sharedStyles.listContent} keyboardShouldPersistTaps="handled">
          <Text style={sharedStyles.muted}>
            Needed before you can sell paid tickets. Verification is simulated in this version: it checks that both details are saved.
          </Text>

          <View style={[sharedStyles.card, styles.form]}>
            <Text style={sharedStyles.body} nativeID="profilePhoneLabel">Contact phone</Text>
            <TextInput accessibilityLabelledBy="profilePhoneLabel" style={formStyles.input} value={phone} onChangeText={setPhone}
              keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={PHONE_MAX}
              editable={!busy} placeholder="+7 701 123 45 67" placeholderTextColor={theme.colors.muted} />
            <Text style={sharedStyles.body} nativeID="profilePayoutLabel">Payout account (for example IBAN)</Text>
            <TextInput accessibilityLabelledBy="profilePayoutLabel" style={formStyles.input} value={payout} onChangeText={setPayout}
              autoCapitalize="characters" autoCorrect={false} maxLength={PAYOUT_MAX} editable={!busy}
              placeholder="KZ00 0000 0000 0000 0000" placeholderTextColor={theme.colors.muted} />
            <AppButton title={busy === "save" ? "Saving…" : "Save"} onPress={save} disabled={busy !== null || !unsaved} loading={busy === "save"} />
          </View>

          {notice ? (
            <Text accessibilityRole="alert" style={notice.error ? formStyles.error : sharedStyles.body}>{notice.text}</Text>
          ) : null}

          <View style={[sharedStyles.card, styles.form]}>
            <Text accessibilityRole="header" style={sharedStyles.title}>Identity</Text>
            {profile.paid_sales_verified ? (
              <Text style={sharedStyles.body}>Verified. You can activate paid sales on your events.</Text>
            ) : (
              <>
                <Text style={sharedStyles.body}>
                  {unsaved || !canVerify(profile)
                    ? "Not verified yet. Save both details above, then verify."
                    : "Not verified yet. Your details are saved, so you can verify now."}
                </Text>
                <AppButton title={busy === "verify" ? "Verifying…" : "Verify identity"} onPress={verify}
                  disabled={busy !== null || unsaved || !canVerify(profile)} loading={busy === "verify"} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: theme.spacing.sm },
});
