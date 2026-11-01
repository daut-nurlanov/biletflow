import { StyleSheet, Text, View } from "react-native";

import { sharedStyles, theme } from "../theme";

interface StatTileProps {
  label: string;
  /** Display-ready text, e.g. "1,284" or "<1%". */
  value: string;
}

/** One headline number with its label. Receives props and never fetches. */
export function StatTile({ label, value }: StatTileProps) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.tile}>
      <Text style={sharedStyles.muted}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: 96,
    // Keeps values on one line across a row even when a longer label wraps.
    justifyContent: "space-between",
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
  },
  value: { fontSize: theme.fontSize.heading, fontWeight: "700", color: theme.colors.text },
});
