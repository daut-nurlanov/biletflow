import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "../auth/SessionContext";
import { AppButton } from "../components/AppButton";
import type { ScannerStackParamList } from "../navigation/types";
import { sharedStyles, theme } from "../theme";
import type { AttendeeRegistration } from "../types/auth";
import { validateRegistration } from "../utils/registration";

type Props = NativeStackScreenProps<ScannerStackParamList, "Register">;
type Form = AttendeeRegistration & { confirmPassword: string };

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useSession();
  const [form, setForm] = useState<Form>({
    full_name: "", email: "", password: "", confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nameInput = useRef<TextInputInstance>(null);
  const emailInput = useRef<TextInputInstance>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const confirmationInput = useRef<TextInputInstance>(null);
  const errors = submitted ? validateRegistration(form, form.confirmPassword) : {};

  function update(field: keyof Form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError(null);
  }

  async function handleSubmit() {
    if (inFlight.current) return;
    setSubmitted(true);
    setError(null);
    const validation = validateRegistration(form, form.confirmPassword);
    if (Object.keys(validation).length) {
      if (validation.full_name) nameInput.current?.focus();
      else if (validation.email) emailInput.current?.focus();
      else if (validation.password) passwordInput.current?.focus();
      else confirmationInput.current?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      await signUp({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      });
      // SessionContext saves the returned token and opens the attendee tabs.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't create your account. Please try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>BiletFlow</Text>
            <Text accessibilityRole="header" style={styles.heading}>Create an account</Text>
            <Text style={sharedStyles.muted}>
              Create an attendee account to browse events and view your tickets.
            </Text>
          </View>

          <View style={sharedStyles.card}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              ref={nameInput}
              accessibilityLabel="Full name"
              style={styles.input}
              value={form.full_name}
              onChangeText={(value) => update("full_name", value)}
              placeholder="Your full name"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailInput.current?.focus()}
              submitBehavior="submit"
              editable={!submitting}
            />
            <FieldError message={errors.full_name} />

            <Text style={styles.label}>Email</Text>
            <TextInput
              ref={emailInput}
              accessibilityLabel="Email"
              style={styles.input}
              value={form.email}
              onChangeText={(value) => update("email", value)}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              submitBehavior="submit"
              editable={!submitting}
            />
            <FieldError message={errors.email} />

            <View style={styles.passwordHeading}>
              <Text style={styles.label}>Password</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPasswords ? "Hide passwords" : "Show passwords"}
                accessibilityState={{ disabled: submitting }}
                onPress={() => setShowPasswords((shown) => !shown)}
                disabled={submitting}
                style={styles.toggle}
              >
                <Text style={styles.linkText}>{showPasswords ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <TextInput
              ref={passwordInput}
              accessibilityLabel="Password"
              style={styles.input}
              value={form.password}
              onChangeText={(value) => update("password", value)}
              placeholder="At least 8 characters"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmationInput.current?.focus()}
              submitBehavior="submit"
              editable={!submitting}
            />
            <FieldError message={errors.password} />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              ref={confirmationInput}
              accessibilityLabel="Confirm password"
              style={styles.input}
              value={form.confirmPassword}
              onChangeText={(value) => update("confirmPassword", value)}
              placeholder="Re-enter your password"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              editable={!submitting}
            />
            <FieldError message={errors.confirmPassword} />

            {error && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            )}

            <AppButton
              title={submitting ? "Creating account…" : "Create account"}
              onPress={handleSubmit}
              disabled={submitting}
              loading={submitting}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Already have an account? Sign in"
            accessibilityState={{ disabled: submitting }}
            onPress={() => navigation.goBack()}
            disabled={submitting}
            style={styles.link}
          >
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.fieldError}>
      {message}
    </Text>
  ) : null;
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
  brand: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.colors.primary },
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
  passwordHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggle: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.spacing.sm },
  link: { minHeight: 48, alignItems: "center", justifyContent: "center", padding: theme.spacing.sm },
  linkText: { color: theme.colors.primary, fontSize: theme.fontSize.body, fontWeight: "600" },
  fieldError: { color: "#B42318", fontSize: theme.fontSize.small, lineHeight: 20 },
  error: {
    color: "#B42318",
    backgroundColor: "#FEF3F2",
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    fontSize: theme.fontSize.small,
    lineHeight: 20,
  },
});
