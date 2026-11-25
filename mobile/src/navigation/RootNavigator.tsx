import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Alert, Pressable, Text, View } from "react-native";

import { useSession } from "../auth/SessionContext";
import { LanguagePicker } from "../components/LanguagePicker";
import { CheckoutScreen } from "../screens/CheckoutScreen";
import { EventDashboardScreen } from "../screens/EventDashboardScreen";
import { EventActivityScreen } from "../screens/EventActivityScreen";
import { EventAttendeesScreen } from "../screens/EventAttendeesScreen";
import { EventDetailsScreen } from "../screens/EventDetailsScreen";
import { EventSetupScreen } from "../screens/EventSetupScreen";
import { EventStaffScreen } from "../screens/EventStaffScreen";
import { EventOrdersScreen } from "../screens/EventOrdersScreen";
import { EventPromotionsScreen } from "../screens/EventPromotionsScreen";
import { EventsScreen } from "../screens/EventsScreen";
import { MyTicketsScreen } from "../screens/MyTicketsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { OrderDetailScreen } from "../screens/OrderDetailScreen";
import { OrderHistoryScreen } from "../screens/OrderHistoryScreen";
import { OrganizerEventsScreen } from "../screens/OrganizerEventsScreen";
import { EditOrganizerEventScreen, NewOrganizerEventScreen } from "../screens/OrganizerEventFormScreen";
import { OrganizerTicketTypeFormScreen } from "../screens/OrganizerTicketTypeFormScreen";
import { OrganizerProfileScreen } from "../screens/OrganizerProfileScreen";
import { PaidSalesActivationScreen } from "../screens/PaidSalesActivationScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { StaffEventsScreen } from "../screens/StaffEventsScreen";
import { StaffToolsScreen } from "../screens/StaffToolsScreen";
import { SupportListScreen } from "../screens/SupportListScreen";
import { SupportNewScreen } from "../screens/SupportNewScreen";
import { SupportThreadScreen } from "../screens/SupportThreadScreen";
import { theme } from "../theme";
import { BrandIcon, type BrandIconName } from "../components/BrandIcon";
import type {
  EventsStackParamList, OrganizerStackParamList, RootTabParamList, ScannerStackParamList, SupportStackParamList, TicketsStackParamList,
} from "./types";
import { useLocale } from "../i18n/LocaleContext";

const Tabs = createBottomTabNavigator<RootTabParamList>();
const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const OrganizerStack = createNativeStackNavigator<OrganizerStackParamList>();
const StaffStack = createNativeStackNavigator<ScannerStackParamList>();
const SupportStack = createNativeStackNavigator<SupportStackParamList>();
const TicketsStack = createNativeStackNavigator<TicketsStackParamList>();
const tabIcons: Record<keyof RootTabParamList, BrandIconName> = {
  EventsTab: "calendar", MyTickets: "ticket", OrganizerTab: "grid", StaffTab: "scan",
  SupportTab: "chat", NotificationsTab: "bell",
};

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
  const { t: localize } = useLocale();
  const { signOut } = useSession();
  const confirm = () => {
    Alert.alert(localize("Sign out?"), localize("You'll need to sign in again."), [
      { text: localize("Cancel"), style: "cancel" },
      { text: localize("Sign out"), style: "destructive", onPress: () => { void signOut(); } },
    ]);
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <LanguagePicker />
      <Pressable accessibilityRole="button" accessibilityLabel={localize("Sign out")} onPress={confirm} hitSlop={12}>
        <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.body }}>{localize("Sign out")}</Text>
      </Pressable>
    </View>
  );
}

function EventsNavigator() {
  const { t: localize } = useLocale();
  return (
    <EventsStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <EventsStack.Screen name="Events" component={EventsScreen} />
      <EventsStack.Screen name="EventDetails" component={EventDetailsScreen} options={{ title: localize("Event details") }} />
      <EventsStack.Screen name="Checkout" component={CheckoutScreen} options={{ title: localize("Checkout") }} />
    </EventsStack.Navigator>
  );
}

function SupportNavigator() {
  const { t: localize } = useLocale();
  return (
    <SupportStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <SupportStack.Screen name="SupportList" component={SupportListScreen} options={{ title: localize("Support") }} />
      <SupportStack.Screen name="SupportNew" component={SupportNewScreen}
        getId={({ params }) => params.ticketId ? `ticket:${params.ticketId}` : params.orderId ? `order:${params.orderId}` : params.eventId ? `event:${params.eventId}` : "general"}
        options={{ title: localize("New request") }} />
      <SupportStack.Screen name="SupportThread" component={SupportThreadScreen}
        getId={({ params }) => params.caseId} options={{ title: localize("Conversation") }} />
    </SupportStack.Navigator>
  );
}

function TicketsNavigator() {
  const { t: localize } = useLocale();
  return (
    <TicketsStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <TicketsStack.Screen name="TicketList" component={MyTicketsScreen} options={{ title: localize("My Tickets") }} />
      <TicketsStack.Screen name="OrderHistory" component={OrderHistoryScreen} options={{ title: localize("Purchase history") }} />
    </TicketsStack.Navigator>
  );
}

function OrganizerNavigator() {
  const { t: localize } = useLocale();
  return (
    <OrganizerStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary, headerRight: () => <SignOutButton /> }}>
      <OrganizerStack.Screen name="OrganizerEvents" component={OrganizerEventsScreen} options={({ navigation }) => ({
        title: localize("My events"),
        headerLeft: () => (
          <Pressable accessibilityRole="button" accessibilityLabel={localize("Organizer profile")} hitSlop={12}
            onPress={() => navigation.navigate("OrganizerProfile")}>
            <Text style={{ color: theme.colors.primary, fontSize: theme.fontSize.body }}>{localize("Profile")}</Text>
          </Pressable>
        ),
      })} />
      <OrganizerStack.Screen name="EventDashboard" component={EventDashboardScreen} options={{ title: localize("Event dashboard") }} />
      <OrganizerStack.Screen name="EventActivity" component={EventActivityScreen} options={{ title: localize("Event activity") }} />
      <OrganizerStack.Screen name="EventStaff" component={EventStaffScreen} options={{ title: localize("Door staff") }} />
      <OrganizerStack.Screen name="NewEvent" component={NewOrganizerEventScreen} options={{ title: localize("New event") }} />
      <OrganizerStack.Screen name="EditEvent" component={EditOrganizerEventScreen} options={{ title: localize("Edit event") }} />
      <OrganizerStack.Screen name="EventSetup" component={EventSetupScreen} options={{ title: localize("Event setup") }} />
      <OrganizerStack.Screen name="TicketTypeForm" component={OrganizerTicketTypeFormScreen}
        options={({ route }) => ({ title: route.params.ticketTypeId ? localize("Edit ticket type") : localize("New ticket type") })} />
      <OrganizerStack.Screen name="EventAttendees" component={EventAttendeesScreen} options={{ title: localize("Attendees") }} />
      <OrganizerStack.Screen name="EventOrders" component={EventOrdersScreen} options={{ title: localize("Orders") }} />
      <OrganizerStack.Screen name="OrderDetail" component={OrderDetailScreen}
        getId={({ params }) => params.orderId} options={{ title: localize("Order") }} />
      <OrganizerStack.Screen name="EventPromotions" component={EventPromotionsScreen} options={{ title: localize("Promotions") }} />
      <OrganizerStack.Screen name="OrganizerProfile" component={OrganizerProfileScreen} options={{ title: localize("Organizer profile") }} />
      <OrganizerStack.Screen name="PaidSalesActivation" component={PaidSalesActivationScreen} options={{ title: localize("Paid sales") }} />
    </OrganizerStack.Navigator>
  );
}

function StaffNavigator() {
  const { t: localize } = useLocale();
  return (
    <StaffStack.Navigator screenOptions={{ headerTintColor: theme.colors.primary }}>
      <StaffStack.Screen name="StaffEvents" component={StaffEventsScreen} options={{ title: localize("Assigned events") }} />
      <StaffStack.Screen name="Scan" component={ScanScreen} options={{ title: localize("Scan tickets") }} />
      <StaffStack.Screen name="StaffTools" component={StaffToolsScreen} options={{ title: localize("Attendees") }} />
    </StaffStack.Navigator>
  );
}

export function RootNavigator({ role }: { role: "attendee" | "organizer" }) {
  const { t: localize } = useLocale();
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarIcon: ({ color }) => <BrandIcon name={tabIcons[route.name]} color={color} size={22} />,
          tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
          tabBarItemStyle: { minHeight: 52 },
          headerTintColor: theme.colors.text,
          headerRight: () => <SignOutButton />,
          headerRightContainerStyle: { paddingEnd: theme.spacing.md },
        })}
      >
        {role === "attendee" ? (
          <>
            <Tabs.Screen name="EventsTab" component={EventsNavigator} options={{ title: localize("Events"), headerShown: false }} />
            <Tabs.Screen name="MyTickets" component={TicketsNavigator} options={{ title: localize("My Tickets"), headerShown: false }} />
          </>
        ) : (
          <>
            <Tabs.Screen name="OrganizerTab" component={OrganizerNavigator} options={{ title: localize("Organizer"), headerShown: false }} />
            <Tabs.Screen name="StaffTab" component={StaffNavigator} options={{ title: localize("Scanner"), headerShown: false }} />
          </>
        )}
        <Tabs.Screen name="SupportTab" component={SupportNavigator} options={{ title: localize("Support"), headerShown: false }} />
        <Tabs.Screen name="NotificationsTab" component={NotificationsScreen} options={{ title: localize("Alerts"), headerTitle: localize("Notifications") }} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
