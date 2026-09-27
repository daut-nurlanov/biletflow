import { ActivityIndicator, Text, View } from "react-native";

import { sharedStyles, theme } from "../theme";

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <View style={sharedStyles.state} accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[sharedStyles.body, sharedStyles.centeredText]} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </View>
  );
}
