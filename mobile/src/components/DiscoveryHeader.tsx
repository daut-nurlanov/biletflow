import { StyleSheet, Text, TextInput, View } from "react-native";
import { sharedStyles, theme } from "../theme";
import { BrandIcon } from "./BrandIcon";
import { useLocale } from "../i18n/LocaleContext";

export function DiscoveryHeader({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (value: string) => void;
}) {
  const { t: localize } = useLocale();

  return (
    <View style={styles.header}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <BrandIcon name="ticket" color={theme.colors.surface} />
        </View>

        <Text
          accessibilityRole="header"
          style={[sharedStyles.heading, styles.heroTitle]}
        >
          {localize("Find your next event")}
        </Text>
      </View>

      <View style={styles.search}>
        <BrandIcon name="search" size={20} />

        <TextInput
          accessibilityLabel={localize("Search events")}
          placeholder={localize("Event, venue, or category")}
          placeholderTextColor={theme.colors.muted}
          value={query}
          onChangeText={onSearch}
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: theme.spacing.md,
  },
  hero: {
    alignItems: "flex-start",
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 29,
  },
  mark: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
  },
  input: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
    color: theme.colors.text,
  },
});