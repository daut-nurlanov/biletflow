import { Pressable, StyleSheet, Text } from "react-native";

import { sharedStyles, theme } from "../theme";
import type { Event } from "../types/event";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";

interface EventCardProps {
  event: Event;
  onPress: () => void;
}

export function EventCard({ event, onPress }: EventCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens event details and ticket types"
      onPress={onPress}
      style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
    >
      <Text style={sharedStyles.title}>{event.title}</Text>
      <Text style={sharedStyles.body}>{event.venue_name}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(event.start_time)}</Text>
      <StatusBadge status={event.status} />
      <Text style={styles.link}>View details →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  link: { color: theme.colors.primary, fontSize: theme.fontSize.small, fontWeight: "600" },
});
