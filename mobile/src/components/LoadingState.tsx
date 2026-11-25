import { ActivityIndicator, Text, View } from "react-native";

import { useLocale } from "../i18n/LocaleContext";
import { sharedStyles, theme } from "../theme";

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  const { t } = useLocale();
  return (
    <View style={sharedStyles.state} accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[sharedStyles.body, sharedStyles.centeredText]} accessibilityLiveRegion="polite">
        {t(message)}
      </Text>
    </View>
  );
}
