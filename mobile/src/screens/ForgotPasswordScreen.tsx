import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from "react-native";

import { forgotPassword, resetPassword } from "../api/auth";
import { AppButton } from "../components/AppButton";
import { Screen } from "../components/Screen";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles as styles } from "../theme/forms";
import { useLocale } from "../i18n/LocaleContext";
import { passwordValidation } from "../utils/registration";

type Props = NativeStackScreenProps<ScannerStackParamList, "ForgotPassword">;

/** Two steps on one screen: ask for a code, then use the code to choose a new password. */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { t: localize } = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  async function sendCode() {
    if (locked.current || !email.trim()) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      // The server always returns the same response for a known or unknown email.
      await forgotPassword(email);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request a reset code.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (locked.current) return;
    if (!code.trim()) { setError("Enter the reset code."); return; }
    const invalidPassword = passwordValidation(password);
    if (invalidPassword) { setError(invalidPassword); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      await resetPassword(code, password);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset your password.");
    } finally { locked.current = false; setBusy(false); }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {done ? (
            <>
              <Text accessibilityRole="alert" style={sharedStyles.body}>{localize("Password changed. You can sign in now.")}</Text>
              <AppButton title={localize("Back to sign in")} onPress={() => navigation.popToTop()} />
            </>
          ) : (
            <>
              <Text style={sharedStyles.body}>
                {localize("Enter your email to request a reset code.")}
              </Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com"
                placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" accessibilityLabel={localize("Email")} editable={!busy && !sent} />
              {sent ? (
                <Text accessibilityRole="alert" style={sharedStyles.muted}>
                  {localize("If that email has an account, a reset code was sent.")}
                </Text>
              ) : (
                <AppButton title={busy ? localize("Sending…") : localize("Send reset code")} onPress={sendCode} disabled={!email.trim()} loading={busy} />
              )}
              {sent && (
                <>
                  <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={localize("Reset code")}
                    placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false}
                    accessibilityLabel={localize("Reset code")} editable={!busy} />
                  <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={localize("New password")}
                    placeholderTextColor={theme.colors.muted} secureTextEntry autoCapitalize="none"
                    accessibilityLabel={localize("New password")} editable={!busy} />
                  <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder={localize("Repeat new password")}
                    placeholderTextColor={theme.colors.muted} secureTextEntry autoCapitalize="none"
                    accessibilityLabel={localize("Repeat new password")} editable={!busy} />
                  <AppButton title={busy ? localize("Saving…") : localize("Change password")} onPress={submit} loading={busy} />
                </>
              )}
              {error && <Text accessibilityRole="alert" style={styles.error}>{localize(error)}</Text>}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
