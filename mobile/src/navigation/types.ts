import type { NavigatorScreenParams } from "@react-navigation/native";
import type { SupportContext } from "../types/support";

export type EventsStackParamList = {
  Events: undefined;
  EventDetails: { eventId: string };
  Checkout: { eventId: string; ticketTypeId?: string; campaignToken?: string };
};

export type SupportStackParamList = {
  SupportList: undefined;
  SupportNew: SupportContext;
  SupportThread: { caseId: string };
};

export type OrganizerStackParamList = {
  OrganizerEvents: undefined;
  EventDashboard: { eventId: string };
  EventActivity: { eventId: string; eventTitle: string };
  EventStaff: { eventId: string; eventTitle: string };
};

export type TicketsStackParamList = {
  TicketList: undefined;
  OrderHistory: undefined;
};

export type ScannerStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  StaffEvents: undefined;
  Scan: { eventId: string; eventTitle: string };
  StaffTools: { eventId: string; eventTitle: string };
};

export type RootTabParamList = {
  EventsTab: NavigatorScreenParams<EventsStackParamList> | undefined;
  MyTickets: NavigatorScreenParams<TicketsStackParamList> | undefined;
  OrganizerTab: NavigatorScreenParams<OrganizerStackParamList> | undefined;
  StaffTab: NavigatorScreenParams<ScannerStackParamList> | undefined;
  SupportTab: NavigatorScreenParams<SupportStackParamList> | undefined;
  NotificationsTab: undefined;
};
