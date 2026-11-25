import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { theme } from "../theme";

interface AppButtonProps {
  title: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export function AppButton({ title, accessibilityLabel = title, onPress, disabled = false, loading = false, variant = "primary" }: AppButtonProps) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], (pressed || unavailable) && styles.dimmed]}
    >
      {loading && <ActivityIndicator color={variant === "secondary" ? theme.colors.accentInk : theme.colors.surface} />}
      <Text style={[styles.label, variant === "secondary" && styles.secondaryLabel]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.accentSoft },
  danger: { backgroundColor: theme.colors.danger },
  dimmed: { opacity: 0.6 },
  label: {
    color: theme.colors.surface, fontSize: theme.fontSize.body, fontWeight: "700",
    textAlign: "center", flexShrink: 1,
  },
  secondaryLabel: { color: theme.colors.accentInk },
});
