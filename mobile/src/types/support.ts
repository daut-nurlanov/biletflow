export const SUPPORT_CATEGORIES = ["ticket_delivery", "payment", "refund", "seating", "event_information", "check_in", "account", "activation", "technical"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export type SupportStatus = "open" | "in_progress" | "waiting_customer" | "resolved";
export interface SupportContext { eventId?: string; ticketId?: string; orderId?: string }
export interface SupportMessage { id: string; sender_id: string; sender_name?: string; message: string; created_at: string }
export interface SupportCase {
  id: string;
  category: SupportCategory;
  status: SupportStatus;
  kind: "attendee" | "organizer";
  event_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  event_title?: string | null;
  opened_by_name?: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  escalated: boolean;
  created_at: string;
  updated_at: string;
  your_role_in_case?: "owner" | "handler" | "admin";
  messages?: SupportMessage[];
}

export const supportLabel = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
