import { Pressable, StyleSheet, Text, View } from "react-native";

import { sharedStyles, theme } from "../theme";
import type { Event } from "../types/event";
import { formatDateTime } from "../utils/formatting";
import { StatusBadge } from "./StatusBadge";
import { EventImage } from "./EventImage";
import { BrandIcon } from "./BrandIcon";
import { useLocale } from "../i18n/LocaleContext";

interface EventCardProps {
  event: Event;
  onPress: () => void;
  /** Visible call to action. Defaults to the attendee wording. */
  actionLabel?: string;
  /** What screen readers say the card opens. Defaults to the attendee wording. */
  accessibilityHint?: string;
  showCover?: boolean;
}

export function EventCard({
  event,
  onPress,
  actionLabel = "View details →",
  accessibilityHint = "Opens event details and ticket types",
  showCover = false,
}: EventCardProps) {
  const { lang } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [sharedStyles.card, pressed && styles.pressed]}
    >
      {showCover ? <EventImage key={event.image_url} uri={event.image_url} title={event.title} category={event.category} /> : null}
      {showCover && event.category ? <Text style={styles.category}>{event.category}</Text> : null}
      <Text style={sharedStyles.title}>{event.title}</Text>
      <View style={styles.action}>
        <BrandIcon name="pin" size={16} />
        <Text style={[sharedStyles.body, styles.meta]}>{event.venue_name}</Text>
      </View>
      <View style={styles.action}>
        <BrandIcon name="calendar" size={16} />
        <Text style={[sharedStyles.muted, styles.meta]}>{formatDateTime(event.start_time, lang)}</Text>
      </View>
      <StatusBadge status={event.status} />
      <View style={styles.action}>
        <Text style={styles.link}>{actionLabel}</Text>
        <BrandIcon name="arrow" size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  link: { color: theme.colors.primary, fontSize: theme.fontSize.small, fontWeight: "600" },
  category: { color: theme.colors.accentInk, fontSize: 13, fontWeight: "700" },
  action: { flexDirection: "row", gap: 6, alignItems: "center" },
  meta: { flexShrink: 1 },
});
