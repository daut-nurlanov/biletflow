import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useSession } from "../auth/SessionContext";
import { LoadingState } from "../components/LoadingState";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { StaffEventsScreen } from "../screens/StaffEventsScreen";
import { theme } from "../theme";
import type { ScannerStackParamList } from "./types";

const Stack = createNativeStackNavigator<ScannerStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

/**
 * Shared sign-in/registration flow and door scanner. Auth screens are removed
 * after sign-in so "back" cannot return to them.
 */
export function ScannerNavigator() {
  const { state } = useSession();

  if (state.status === "restoring") {
    return <LoadingState message="Checking your sign-in…" />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerTintColor: theme.colors.primary }}>
        {state.status === "signedIn" ? (
          <>
            <Stack.Screen name="StaffEvents" component={StaffEventsScreen} options={{ title: "Your events" }} />
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
              options={({ route }) => ({ title: route.params.eventTitle })}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
