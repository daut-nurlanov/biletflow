import { Alert, Pressable, StyleSheet, Text } from "react-native";

import { localeNames, useLocale } from "../i18n/LocaleContext";
import type { Lang } from "../i18n/messages";
import { theme } from "../theme";

export function LanguagePicker() {
  const { lang, setLang, t } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Language: {name}', { name: localeNames[lang] })}
      style={styles.control}
      onPress={() => Alert.alert(t("Language"), undefined, (Object.keys(localeNames) as Lang[]).map(
        (code) => ({ text: localeNames[code], onPress: () => setLang(code) }),
      ), { cancelable: true })}
    >
      <Text style={styles.label}>{lang === "kk" ? "ҚАЗ" : lang.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing.xs },
  label: { color: theme.colors.primary, fontWeight: "700", fontSize: theme.fontSize.small },
});
