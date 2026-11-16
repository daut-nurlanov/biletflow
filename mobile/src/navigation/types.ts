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
};

export type ScannerStackParamList = {
  Login: undefined;
  Register: undefined;
  StaffEvents: undefined;
  Scan: { eventId: string; eventTitle: string };
  StaffTools: { eventId: string; eventTitle: string };
};

export type RootTabParamList = {
  EventsTab: NavigatorScreenParams<EventsStackParamList> | undefined;
  MyTickets: undefined;
  OrganizerTab: NavigatorScreenParams<OrganizerStackParamList> | undefined;
  StaffTab: NavigatorScreenParams<ScannerStackParamList> | undefined;
  SupportTab: NavigatorScreenParams<SupportStackParamList> | undefined;
};
