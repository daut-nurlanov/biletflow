import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Alert, Pressable, Text } from "react-native";

import { useSession } from "../auth/SessionContext";
import { CheckoutScreen } from "../screens/CheckoutScreen";
import { EventDashboardScreen } from "../screens/EventDashboardScreen";
import { EventActivityScreen } from "../screens/EventActivityScreen";
import { EventAttendeesScreen } from "../screens/EventAttendeesScreen";
import { EventDetailsScreen } from "../screens/EventDetailsScreen";
import { EventStaffScreen } from "../screens/EventStaffScreen";
import { EventOrdersScreen } from "../screens/EventOrdersScreen";
import { EventPromotionsScreen } from "../screens/EventPromotionsScreen";
import { EventsScreen } from "../screens/EventsScreen";
import { MyTicketsScreen } from "../screens/MyTicketsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { OrderDetailScreen } from "../screens/OrderDetailScreen";
import { OrderHistoryScreen } from "../screens/OrderHistoryScreen";
import { OrganizerEventsScreen } from "../screens/OrganizerEventsScreen";
import { OrganizerProfileScreen } from "../screens/OrganizerProfileScreen";
import { PaidSalesActivationScreen } from "../screens/PaidSalesActivationScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { StaffEventsScreen } from "../screens/StaffEventsScreen";
import { StaffToolsScreen } from "../screens/StaffToolsScreen";
import { SupportListScreen } from "../screens/SupportListScreen";
import { SupportNewScreen } from "../screens/SupportNewScreen";
import { SupportThreadScreen } from "../screens/SupportThreadScreen";
import { theme } from "../theme";
import type {
  EventsStackParamList, OrganizerStackParamList, RootTabParamList, ScannerStackParamList, SupportStackParamList, TicketsStackParamList,
} from "./types";

const Tabs = createBottomTabNavigator<RootTabParamList>();
const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const OrganizerStack = createNativeStackNavigator<OrganizerStackParamList>();
const StaffStack = createNativeStackNavigator<ScannerStackParamList>();
const SupportStack = createNativeStackNavigator<SupportStackParamList>();
const TicketsStack = createNativeStackNavigator<TicketsStackParamList>();

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

function SignOutButton() {
  const { signOut } = useSession();
  const confirm = () => {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { void signOut(); } },
    ]);
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={confirm} hitSlop={12}>
      <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.body }}>Sign out</Text>
    </Pressable>
  );
}

function EventsNavigator() {
  return (
    <EventsStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <EventsStack.Screen name="Events" component={EventsScreen} />
      <EventsStack.Screen name="EventDetails" component={EventDetailsScreen} options={{ title: "Event details" }} />
      <EventsStack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
    </EventsStack.Navigator>
  );
}

function SupportNavigator() {
  return (
    <SupportStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <SupportStack.Screen name="SupportList" component={SupportListScreen} options={{ title: "Support" }} />
      <SupportStack.Screen name="SupportNew" component={SupportNewScreen}
        getId={({ params }) => params.ticketId ? `ticket:${params.ticketId}` : params.orderId ? `order:${params.orderId}` : params.eventId ? `event:${params.eventId}` : "general"}
        options={{ title: "New request" }} />
      <SupportStack.Screen name="SupportThread" component={SupportThreadScreen}
        getId={({ params }) => params.caseId} options={{ title: "Conversation" }} />
    </SupportStack.Navigator>
  );
}

function TicketsNavigator() {
  return (
    <TicketsStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <TicketsStack.Screen name="TicketList" component={MyTicketsScreen} options={{ title: "My Tickets" }} />
      <TicketsStack.Screen name="OrderHistory" component={OrderHistoryScreen} options={{ title: "Purchase history" }} />
    </TicketsStack.Navigator>
  );
}

function OrganizerNavigator() {
  return (
    <OrganizerStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <OrganizerStack.Screen name="OrganizerEvents" component={OrganizerEventsScreen} options={({ navigation }) => ({
        title: "My events",
        headerLeft: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Organizer profile" hitSlop={12}
            onPress={() => navigation.navigate("OrganizerProfile")}>
            <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.body }}>Profile</Text>
          </Pressable>
        ),
      })} />
      <OrganizerStack.Screen name="EventDashboard" component={EventDashboardScreen} options={{ title: "Event dashboard" }} />
      <OrganizerStack.Screen name="EventActivity" component={EventActivityScreen} options={{ title: "Event activity" }} />
      <OrganizerStack.Screen name="EventStaff" component={EventStaffScreen} options={{ title: "Door staff" }} />
      <OrganizerStack.Screen name="EventAttendees" component={EventAttendeesScreen} options={{ title: "Attendees" }} />
      <OrganizerStack.Screen name="EventOrders" component={EventOrdersScreen} options={{ title: "Orders" }} />
      <OrganizerStack.Screen name="OrderDetail" component={OrderDetailScreen}
        getId={({ params }) => params.orderId} options={{ title: "Order" }} />
      <OrganizerStack.Screen name="EventPromotions" component={EventPromotionsScreen} options={{ title: "Promotions" }} />
      <OrganizerStack.Screen name="OrganizerProfile" component={OrganizerProfileScreen} options={{ title: "Organizer profile" }} />
      <OrganizerStack.Screen name="PaidSalesActivation" component={PaidSalesActivationScreen} options={{ title: "Paid sales" }} />
    </OrganizerStack.Navigator>
  );
}

function StaffNavigator() {
  return (
    <StaffStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary }}>
      <StaffStack.Screen name="StaffEvents" component={StaffEventsScreen} options={{ title: "Assigned events" }} />
      <StaffStack.Screen name="Scan" component={ScanScreen} options={({ route }) => ({ title: route.params.eventTitle })} />
      <StaffStack.Screen name="StaffTools" component={StaffToolsScreen} options={{ title: "Attendees" }} />
    </StaffStack.Navigator>
  );
}

export function RootNavigator({ role }: { role: "attendee" | "organizer" }) {
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
          headerRight: () => <SignOutButton />,
          headerRightContainerStyle: { paddingEnd: theme.spacing.md },
        }}
      >
        {role === "attendee" ? (
          <>
            <Tabs.Screen name="EventsTab" component={EventsNavigator} options={{ title: "Events", headerShown: false }} />
            <Tabs.Screen name="MyTickets" component={TicketsNavigator} options={{ title: "My Tickets", headerShown: false }} />
          </>
        ) : (
          <>
            <Tabs.Screen name="OrganizerTab" component={OrganizerNavigator} options={{ title: "Organizer", headerShown: false }} />
            <Tabs.Screen name="StaffTab" component={StaffNavigator} options={{ title: "Scanner", headerShown: false }} />
          </>
        )}
        <Tabs.Screen name="SupportTab" component={SupportNavigator} options={{ title: "Support", headerShown: false }} />
        <Tabs.Screen name="NotificationsTab" component={NotificationsScreen} options={{ title: "Alerts", headerTitle: "Notifications" }} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
