import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { EventDashboardScreen } from "../screens/EventDashboardScreen";
import { EventDetailsScreen } from "../screens/EventDetailsScreen";
import { EventsScreen } from "../screens/EventsScreen";
import { MyTicketsScreen } from "../screens/MyTicketsScreen";
import { OrganizerEventsScreen } from "../screens/OrganizerEventsScreen";
import { theme } from "../theme";
import type { EventsStackParamList, OrganizerStackParamList, RootTabParamList } from "./types";

const Tabs = createBottomTabNavigator<RootTabParamList>();
const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const OrganizerStack = createNativeStackNavigator<OrganizerStackParamList>();

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

function EventsNavigator() {
  return (
    <EventsStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary }}>
      <EventsStack.Screen name="Events" component={EventsScreen} />
      <EventsStack.Screen
        name="EventDetails"
        component={EventDetailsScreen}
        options={{ title: "Event details" }}
      />
    </EventsStack.Navigator>
  );
}

// Every user sees this tab for now. TODO: show it only to organizers once login exists.
function OrganizerNavigator() {
  return (
    <OrganizerStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary }}>
      <OrganizerStack.Screen
        name="OrganizerEvents"
        component={OrganizerEventsScreen}
        options={{ title: "My events" }}
      />
      <OrganizerStack.Screen
        name="EventDashboard"
        component={EventDashboardScreen}
        options={{ title: "Event dashboard" }}
      />
    </OrganizerStack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tabs.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarIcon: () => null,
          tabBarIconStyle: { display: "none" },
          tabBarLabelStyle: { fontSize: theme.fontSize.body, fontWeight: "600" },
          tabBarItemStyle: { minHeight: 48 },
          headerTintColor: theme.colors.text,
        }}
      >
        <Tabs.Screen
          name="EventsTab"
          component={EventsNavigator}
          options={{ title: "Events", headerShown: false }}
        />
        <Tabs.Screen name="MyTickets" component={MyTicketsScreen} options={{ title: "My Tickets" }} />
        <Tabs.Screen
          name="OrganizerTab"
          component={OrganizerNavigator}
          options={{ title: "Organizer", headerShown: false }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
