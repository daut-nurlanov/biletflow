import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "./src/auth/SessionContext";
import { ScannerNavigator } from "./src/navigation/ScannerNavigator";

// The SRS requires one mobile app: the door scanner for event staff.
// Insar's attendee screens are still in src/navigation/RootNavigator.tsx for reference.
export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <ScannerNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
