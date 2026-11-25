import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";

import { sharedStyles, theme } from "../theme";
import { formStyles } from "../theme/forms";
import { AppButton } from "./AppButton";
import { Screen } from "./Screen";
import { useLocale } from "../i18n/LocaleContext";

export function OrganizerField({ label, style, ...input }: TextInputProps & { label: string }) {
  const { t } = useLocale();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={sharedStyles.body}>{t(label)}</Text>
      <TextInput {...input} testID={input.testID ?? `setup-${label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
        accessibilityLabel={t(label)} placeholder={input.placeholder ? t(input.placeholder) : undefined}
        placeholderTextColor={theme.colors.muted}
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
  const { t } = useLocale();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={sharedStyles.body}>{t(label)}</Text>
      <View style={formStyles.row}>
        {choices.map((choice) => (
          <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={t(choice.label)}
            accessibilityState={{ checked: value === choice.value, disabled }}
            onPress={() => onChange(choice.value)} disabled={disabled}
            style={[formStyles.choice, value === choice.value && formStyles.selected, disabled && formStyles.disabled]}>
            <Text style={sharedStyles.body}>{t(choice.label)}</Text>
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
  const { t: localize } = useLocale();
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={formStyles.error}>{localize(error)}</Text> : null}
          <AppButton title={busy ? localize("Saving…") : localize(submitTitle)} onPress={onSubmit} disabled={disabled} loading={busy} />
          <AppButton title={localize("Discard and go back")} onPress={onBack} disabled={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
