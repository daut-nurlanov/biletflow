import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { theme } from "../theme";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  label: string;
  options: readonly FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

/** A row of choices that scrolls sideways on narrow phones. Exactly one is selected. */
export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${label}: ${option.label}`}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  chip: {
    minHeight: 40,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
  },
  selected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pressed: { opacity: 0.7 },
  text: { color: theme.colors.text, fontSize: theme.fontSize.small, fontWeight: "600" },
  selectedText: { color: theme.colors.surface },
});
