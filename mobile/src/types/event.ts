import type { TicketType } from "./ticket";

export type EventStatus =
  | "draft"
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled"
  | "suspended";

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

/** An event from GET /api/staff/events (full events row). */
export interface StaffEvent extends Event {
  end_time: string | null;
  venue_address: string | null;
}

export interface EventDetails extends Event {
  ticket_types: TicketType[];
}
