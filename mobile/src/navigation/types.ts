import type { NavigatorScreenParams } from "@react-navigation/native";

export type EventsStackParamList = {
  Events: undefined;
  EventDetails: { eventId: string };
};

export type OrganizerStackParamList = {
  OrganizerEvents: undefined;
  EventDashboard: { eventId: string };
};

export type RootTabParamList = {
  EventsTab: NavigatorScreenParams<EventsStackParamList> | undefined;
  MyTickets: undefined;
  OrganizerTab: NavigatorScreenParams<OrganizerStackParamList> | undefined;
};
