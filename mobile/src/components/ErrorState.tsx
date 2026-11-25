import { Text, View } from "react-native";

import { sharedStyles } from "../theme";
import { AppButton } from "./AppButton";
import { useLocale } from "../i18n/LocaleContext";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
}

export function ErrorState({ title = "Couldn't load this information", message, onRetry }: ErrorStateProps) {
  const { t: localize } = useLocale();
  return (
    <View style={sharedStyles.state}>
      <Text accessibilityRole="header" style={[sharedStyles.title, sharedStyles.centeredText]}>
        {localize(title)}
      </Text>
      <Text accessibilityRole="alert" style={[sharedStyles.body, sharedStyles.centeredText]}>
        {localize(message)}
      </Text>
      <AppButton title={localize("Try again")} onPress={onRetry} />
    </View>
  );
}
