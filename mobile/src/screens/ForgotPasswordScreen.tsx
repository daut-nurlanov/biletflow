import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from "react-native";

import { forgotPassword, resetPassword } from "../api/auth";
import { AppButton } from "../components/AppButton";
import { Screen } from "../components/Screen";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import { formStyles as styles } from "../theme/forms";

type Props = NativeStackScreenProps<ScannerStackParamList, "ForgotPassword">;

/** Two steps on one screen: ask for a code, then use the code to choose a new password. */
export function ForgotPasswordScreen({ navigation }: Props) {
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
    try { await forgotPassword(email); } catch { /* same neutral answer either way */ }
    setSent(true); locked.current = false; setBusy(false);
  }

  async function submit() {
    if (locked.current) return;
    if (!code.trim()) { setError("Enter the reset code."); return; }
    if (Array.from(password).length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password.length > 72) { setError("Password is too long; use at most 72 characters."); return; }
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
              <Text accessibilityRole="alert" style={sharedStyles.body}>Password changed. You can sign in now.</Text>
              <AppButton title="Back to sign in" onPress={() => navigation.popToTop()} />
            </>
          ) : (
            <>
              <Text style={sharedStyles.body}>
                Enter your email and we send a reset code. In this demo the code appears in the app&apos;s Notifications
                or the server log instead of an inbox.
              </Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com"
                placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" accessibilityLabel="Email" editable={!busy && !sent} />
              {sent ? (
                <Text accessibilityRole="alert" style={sharedStyles.muted}>
                  If that email has an account, a reset code was sent.
                </Text>
              ) : (
                <AppButton title={busy ? "Sending…" : "Send reset code"} onPress={sendCode} disabled={!email.trim()} loading={busy} />
              )}
              {sent && (
                <>
                  <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Reset code"
                    placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false}
                    accessibilityLabel="Reset code" editable={!busy} />
                  <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="New password"
                    placeholderTextColor={theme.colors.muted} secureTextEntry autoCapitalize="none"
                    accessibilityLabel="New password" editable={!busy} />
                  <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Repeat new password"
                    placeholderTextColor={theme.colors.muted} secureTextEntry autoCapitalize="none"
                    accessibilityLabel="Repeat new password" editable={!busy} />
                  {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                  <AppButton title={busy ? "Saving…" : "Change password"} onPress={submit} loading={busy} />
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
