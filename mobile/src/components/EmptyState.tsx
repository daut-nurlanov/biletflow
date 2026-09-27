import { Text, View } from "react-native";

import { sharedStyles } from "../theme";

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={sharedStyles.state}>
      <Text accessibilityRole="header" style={[sharedStyles.title, sharedStyles.centeredText]}>
        {title}
      </Text>
      <Text style={[sharedStyles.body, sharedStyles.centeredText]}>{message}</Text>
    </View>
  );
}
