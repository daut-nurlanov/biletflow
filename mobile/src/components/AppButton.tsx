import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { theme } from "../theme";

interface AppButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function AppButton({ title, onPress, disabled = false, loading = false }: AppButtonProps) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || unavailable) && styles.dimmed]}
    >
      {loading && <ActivityIndicator color={theme.colors.surface} />}
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  dimmed: { opacity: 0.6 },
  label: { color: theme.colors.surface, fontSize: theme.fontSize.body, fontWeight: "600" },
});
