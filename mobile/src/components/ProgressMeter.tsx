import { StyleSheet, View } from "react-native";

import { theme } from "../theme";

// A lighter step of the primary green, so the empty part still reads as the same meter.
const TRACK_COLOR = "#E0F2E9";

interface ProgressMeterProps {
  /** Filled share from 0 to 100. Values outside that range are clamped. */
  percent: number;
  /** What the meter measures, for screen readers, e.g. "VIP Balcony tickets sold". */
  accessibilityLabel: string;
  /** The value in words, for screen readers, e.g. "1 of 40 sold". */
  valueText: string;
}

/** A thin horizontal meter. Always pair it with visible text that states the same value. */
export function ProgressMeter({ percent, accessibilityLabel, valueText }: ProgressMeterProps) {
  const filled = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled), text: valueText }}
      style={styles.track}
    >
      {/* minWidth keeps a single sale visible as a small rounded end. */}
      {filled > 0 ? <View style={[styles.fill, { width: `${filled}%` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: TRACK_COLOR,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    minWidth: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
});
