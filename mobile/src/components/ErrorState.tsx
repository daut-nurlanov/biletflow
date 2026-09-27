import { Text, View } from "react-native";

import { sharedStyles } from "../theme";
import { AppButton } from "./AppButton";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
}

export function ErrorState({ title = "Couldn't load this information", message, onRetry }: ErrorStateProps) {
  return (
    <View style={sharedStyles.state}>
      <Text accessibilityRole="header" style={[sharedStyles.title, sharedStyles.centeredText]}>
        {title}
      </Text>
      <Text accessibilityRole="alert" style={[sharedStyles.body, sharedStyles.centeredText]}>
        {message}
      </Text>
      <AppButton title="Try again" onPress={onRetry} />
    </View>
  );
}
