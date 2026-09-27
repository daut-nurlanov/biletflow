import { StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";
import type { EventStatus } from "../types/event";
import type { TicketStatus } from "../types/ticket";

type Status = EventStatus | TicketStatus;
type Tone = "neutral" | "positive" | "info" | "negative";

const statuses: Record<Status, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  upcoming: { label: "Upcoming", tone: "info" },
  active: { label: "Active", tone: "positive" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "negative" },
  valid: { label: "Valid", tone: "positive" },
  checked_in: { label: "Checked in", tone: "info" },
  refunded: { label: "Refunded", tone: "neutral" },
};

const tones = {
  neutral: { background: "#E9EDF1", text: "#405362" },
  positive: { background: "#E0F2E9", text: "#176052" },
  info: { background: "#E6EEFA", text: "#294E80" },
  negative: { background: "#FBE7E7", text: "#923737" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, tone } = statuses[status] ?? { label: "Unknown status", tone: "neutral" };
  const colors = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  label: { fontSize: theme.fontSize.small, fontWeight: "600" },
});
