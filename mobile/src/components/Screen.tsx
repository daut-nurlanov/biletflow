import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";

/** Navigation's visible headers and tab bar own the top and bottom safe areas. */
export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
});
