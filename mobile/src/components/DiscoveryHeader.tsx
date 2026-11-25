import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { sharedStyles, theme } from "../theme";
import { BrandIcon } from "./BrandIcon";

const photo = require("../../assets/catalogue-cover.jpg");

export function DiscoveryHeader({ query, onSearch }: { query: string; onSearch: (value: string) => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.hero}>
        <Image source={photo} accessible={false} style={styles.photo} resizeMode="cover" />
        <View style={styles.heroCopy}>
          <View style={styles.mark}><BrandIcon name="ticket" color={theme.colors.surface} /></View>
          <Text accessibilityRole="header" style={[sharedStyles.heading, styles.heroTitle]}>Find your next event</Text>
        </View>
      </View>
      <View style={styles.search}>
        <BrandIcon name="search" size={20} />
        <TextInput accessibilityLabel="Search events" placeholder="Event, venue, or category"
          placeholderTextColor={theme.colors.muted} value={query} onChangeText={onSearch}
          autoCorrect={false} returnKeyType="search" style={styles.input} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.md },
  hero: { minHeight: 190, justifyContent: "flex-end", backgroundColor: theme.colors.night, borderRadius: theme.radius.lg, overflow: "hidden" },
  photo: { ...StyleSheet.absoluteFill, width: "100%", height: "100%", opacity: 0.63 },
  heroCopy: { alignItems: "flex-start", padding: theme.spacing.lg, gap: theme.spacing.sm },
  heroTitle: { color: theme.colors.surface, fontSize: 29, maxWidth: 250 },
  mark: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, padding: theme.spacing.sm },
  search: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.fieldBorder,
  },
  input: { flex: 1, minHeight: 48, fontSize: 16, color: theme.colors.text },
});
