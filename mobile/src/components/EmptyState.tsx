import { Text, View } from "react-native";
import { useLocale } from "../i18n/LocaleContext";

import { sharedStyles } from "../theme";

export function EmptyState({ title, message }: { title: string; message: string }) {
  const { t } = useLocale();
  return (
    <View style={sharedStyles.state}>
      <Text accessibilityRole="header" style={[sharedStyles.title, sharedStyles.centeredText]}>
        {t(title)}
      </Text>
      <Text style={[sharedStyles.body, sharedStyles.centeredText]}>{t(message)}</Text>
    </View>
  );
}
