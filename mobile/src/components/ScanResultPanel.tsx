import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import type { OutcomeTone, ScanOutcome } from "../utils/scanOutcome";

const TONES: Record<OutcomeTone, { background: string; symbol: string }> = {
  success: { background: "#15803D", symbol: "✓" },
  danger: { background: "#B91C1C", symbol: "✕" },
  warning: { background: "#B45309", symbol: "!" },
};

interface ScanResultPanelProps {
  outcome: ScanOutcome;
  onScanNext: () => void;
  onRetry: () => void;
}

/** Full-screen colored answer, readable at arm's length in a dark doorway. */
export function ScanResultPanel({ outcome, onScanNext, onRetry }: ScanResultPanelProps) {
  const insets = useSafeAreaInsets();
  const tone = TONES[outcome.tone];
  const details = [outcome.ticketType, outcome.seat && `Seat ${outcome.seat}`].filter(Boolean).join(" · ");

  return (
    <View
      style={[styles.panel, { backgroundColor: tone.background, paddingBottom: insets.bottom + theme.spacing.lg }]}
      accessibilityViewIsModal
    >
      <View style={styles.body}>
        <View style={styles.symbolCircle}>
          <Text style={styles.symbol} accessibilityElementsHidden importantForAccessibility="no">
            {tone.symbol}
          </Text>
        </View>
        <Text accessibilityRole="alert" style={styles.headline}>{outcome.headline}</Text>
        {outcome.attendeeName ? <Text style={styles.name}>{outcome.attendeeName}</Text> : null}
        {details ? <Text style={styles.details}>{details}</Text> : null}
        <Text style={styles.message}>{outcome.message}</Text>
      </View>

      <View style={styles.actions}>
        {outcome.retryable && (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel}>Try again</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onScanNext}
          style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={[styles.primaryLabel, { color: tone.background }]}>Scan next ticket</Text>
        </Pressable>
        {outcome.autoDismiss && (
          <Text style={styles.hint}>Scanning again in a moment…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  symbolCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: { color: "#FFFFFF", fontSize: 64, fontWeight: "800", lineHeight: 76 },
  headline: { color: "#FFFFFF", fontSize: 36, fontWeight: "800", textAlign: "center" },
  name: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", textAlign: "center" },
  details: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", textAlign: "center", opacity: 0.95 },
  message: { color: "#FFFFFF", fontSize: 17, lineHeight: 24, textAlign: "center", opacity: 0.95 },
  actions: { gap: theme.spacing.sm },
  button: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  primaryButton: { backgroundColor: "#FFFFFF" },
  secondaryButton: { borderWidth: 2, borderColor: "#FFFFFF" },
  primaryLabel: { fontSize: 18, fontWeight: "800" },
  secondaryLabel: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  hint: { color: "#FFFFFF", textAlign: "center", fontSize: theme.fontSize.small, opacity: 0.9 },
});
