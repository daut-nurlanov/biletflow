import type { TicketType } from "./ticket";

export type EventStatus =
  | "draft"
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  venue_name: string;
  start_time: string;
  capacity: number;
  status: EventStatus;
  has_assigned_seating: boolean;
  is_paid_sales_active: boolean;
  created_at: string;
}

export interface EventDetails extends Event {
  ticket_types: TicketType[];
}
