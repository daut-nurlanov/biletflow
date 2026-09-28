import { Pressable, StyleSheet, Text } from "react-native";

import { sharedStyles, theme } from "../theme";
import type { Event } from "../types/event";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";

interface EventCardProps {
  event: Event;
  onPress: () => void;
  /** Visible call to action. Defaults to the attendee wording. */
  actionLabel?: string;
  /** What screen readers say the card opens. Defaults to the attendee wording. */
  accessibilityHint?: string;
}

export function EventCard({
  event,
  onPress,
  actionLabel = "View details →",
  accessibilityHint = "Opens event details and ticket types",
}: EventCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
    >
      <Text style={sharedStyles.title}>{event.title}</Text>
      <Text style={sharedStyles.body}>{event.venue_name}</Text>
      <Text style={sharedStyles.muted}>{formatDateTime(event.start_time)}</Text>
      <StatusBadge status={event.status} />
      <Text style={styles.link}>{actionLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  link: { color: theme.colors.primary, fontSize: theme.fontSize.small, fontWeight: "600" },
});
