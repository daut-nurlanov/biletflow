import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";

import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { AppButton } from "./AppButton";
import { Screen } from "./Screen";

export function OrganizerField({ label, style, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={sharedStyles.body}>{label}</Text>
      <TextInput {...input} testID={input.testID ?? `setup-${label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
        accessibilityLabel={label} placeholderTextColor={theme.colors.muted}
        style={[formStyles.input, input.multiline && formStyles.message, style]} />
    </View>
  );
}

export function OrganizerTimeField({ label, ...input }: TextInputProps & { label: string }) {
  return <OrganizerField {...input} label={label} placeholder="YYYY-MM-DD HH:mm"
    autoCapitalize="none" autoCorrect={false} maxLength={16} />;
}

export function OrganizerChoices<T extends string>({
  label, choices, value, onChange, disabled,
}: {
  label: string; choices: { value: T; label: string }[]; value: T;
  onChange: (value: T) => void; disabled: boolean;
}) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={sharedStyles.body}>{label}</Text>
      <View style={formStyles.row}>
        {choices.map((choice) => (
          <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={choice.label}
            accessibilityState={{ checked: value === choice.value, disabled }}
            onPress={() => onChange(choice.value)} disabled={disabled}
            style={[formStyles.choice, value === choice.value && formStyles.selected, disabled && formStyles.disabled]}>
            <Text style={sharedStyles.body}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function OrganizerForm({
  children, error, submitTitle, busy, disabled, onSubmit, onBack,
}: PropsWithChildren<{
  error: string | null; submitTitle: string; busy: boolean; disabled: boolean;
  onSubmit: () => void; onBack: () => void;
}>) {
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={formStyles.error}>{error}</Text> : null}
          <AppButton title={busy ? "Saving…" : submitTitle} onPress={onSubmit} disabled={disabled} loading={busy} />
          <AppButton title="Discard and go back" onPress={onBack} disabled={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
