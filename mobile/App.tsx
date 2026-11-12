import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useSession, SessionProvider } from "./src/auth/SessionContext";
import { AppButton } from "./src/components/AppButton";
import { LoadingState } from "./src/components/LoadingState";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ScannerNavigator } from "./src/navigation/ScannerNavigator";
import { theme } from "./src/theme";

function AppRoutes() {
  const { state, signOut } = useSession();

  if (state.status === "restoring") {
    return <LoadingState message="Checking your sign-in…" />;
  }

  // The existing scanner navigator already provides the shared LoginScreen.
  if (state.status === "signedOut" || state.user.role === "event_admin") {
    return <ScannerNavigator />;
  }

  if (state.user.role === "platform_admin") {
    return (
      <SafeAreaView style={styles.adminScreen}>
        <View style={styles.adminContent}>
          <Text style={styles.adminTitle}>BiletFlow administration</Text>
          <Text style={styles.adminMessage}>
            Platform administrators use the BiletFlow website, not the mobile app.
          </Text>
          <AppButton title="Sign out" onPress={() => { void signOut(); }} />
        </View>
      </SafeAreaView>
    );
  }

  // One mobile app for attendees and organizers; organizers can also scan QR tickets.
  return <RootNavigator role={state.user.role} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <AppRoutes />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  adminScreen: { flex: 1, backgroundColor: theme.colors.background },
  adminContent: { flex: 1, justifyContent: "center", gap: theme.spacing.lg, padding: theme.spacing.lg },
  adminTitle: { color: theme.colors.text, fontSize: theme.fontSize.heading, fontWeight: "700" },
  adminMessage: { color: theme.colors.muted, fontSize: theme.fontSize.body, lineHeight: 24 },
});
