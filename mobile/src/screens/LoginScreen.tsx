import { useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import { sharedStyles, theme } from "../theme";

// Seeded door staff account from docs/SETUP.md, offered only in development builds.
const DEMO_STAFF = { email: "nurlan@example.com", password: "demo1234" };

export function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordInput = useRef<TextInput>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // On success the navigator swaps this screen out, so there is nothing else to do.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>BiletFlow</Text>
            <Text accessibilityRole="header" style={styles.heading}>Door scanner</Text>
            <Text style={sharedStyles.muted}>
              Sign in with your staff account to check tickets at the entrance.
            </Text>
          </View>

          <View style={sharedStyles.card}>
            <Text style={styles.label} nativeID="emailLabel">Email</Text>
            <TextInput
              accessibilityLabelledBy="emailLabel"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="staff@example.com"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              submitBehavior="submit"
              editable={!submitting}
            />

            <Text style={styles.label} nativeID="passwordLabel">Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordInput}
                accessibilityLabelledBy="passwordLabel"
                style={[styles.input, styles.flex]}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                editable={!submitting}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                onPress={() => setShowPassword((shown) => !shown)}
                style={styles.toggle}
                hitSlop={8}
              >
                <Text style={styles.toggleText}>{showPassword ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>

            {error && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            )}

            <AppButton
              title={submitting ? "Signing in…" : "Sign in"}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
            />
          </View>

          {__DEV__ && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEmail(DEMO_STAFF.email);
                setPassword(DEMO_STAFF.password);
                setError(null);
              }}
              style={styles.demo}
            >
              <Text style={styles.demoText}>Fill in demo staff login (Nurlan)</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  header: { gap: theme.spacing.xs },
  brand: {
    fontSize: theme.fontSize.body,
    fontWeight: "700",
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  heading: { fontSize: theme.fontSize.heading, fontWeight: "700", color: theme.colors.text },
  label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  toggle: { minHeight: 48, justifyContent: "center", paddingHorizontal: theme.spacing.sm },
  toggleText: { color: theme.colors.primary, fontWeight: "600", fontSize: theme.fontSize.body },
  error: {
    color: "#B42318",
    backgroundColor: "#FEF3F2",
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    fontSize: theme.fontSize.small,
    lineHeight: 20,
  },
  demo: { alignSelf: "center", padding: theme.spacing.sm },
  demoText: { color: theme.colors.muted, fontSize: theme.fontSize.small, textDecorationLine: "underline" },
});
