import { Pressable, StyleSheet, Text, View } from "react-native";

import { sharedStyles, theme } from "../theme";
import type { StaffEvent } from "../types/event";
import { formatDateTime } from "../utils/formatting";
import type { EventTiming } from "../utils/eventTiming";
import { StatusBadge } from "./StatusBadge";

interface StaffEventCardProps {
  event: StaffEvent;
  timing: EventTiming;
  onPress: () => void;
}

export function StaffEventCard({ event, timing, onPress }: StaffEventCardProps) {
  const closed = event.status === "cancelled" || event.status === "suspended";
  const dimmed = closed || timing === "past";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${event.venue_name}, ${formatDateTime(event.start_time)}`}
      accessibilityHint="Opens the ticket scanner for this event"
      onPress={onPress}
      style={({ pressed }) => [
        sharedStyles.card,
        timing === "today" && !closed && styles.today,
        dimmed && styles.dimmed,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.badges}>
        {timing === "today" && !closed && (
          <View style={styles.todayPill}><Text style={styles.todayText}>Today</Text></View>
        )}
        <StatusBadge status={event.status} />
      </View>
      <Text style={sharedStyles.title}>{event.title}</Text>
      <Text style={sharedStyles.body}>{event.venue_name}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(event.start_time)}</Text>
      {closed && (
        <Text style={styles.warning}>
          This event is {event.status}. Its tickets will be refused at the door.
        </Text>
      )}
      <Text style={styles.link}>Start scanning →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  today: { borderColor: theme.colors.primary, borderWidth: 2 },
  dimmed: { opacity: 0.7 },
  pressed: { opacity: 0.55 },
  badges: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
  todayPill: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  todayText: { color: theme.colors.surface, fontSize: theme.fontSize.small, fontWeight: "700" },
  warning: { color: "#923737", fontSize: theme.fontSize.small, lineHeight: 20 },
  link: { color: theme.colors.primary, fontSize: theme.fontSize.small, fontWeight: "600" },
});
