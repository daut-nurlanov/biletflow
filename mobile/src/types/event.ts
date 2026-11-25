import type { TicketType } from "./ticket";

export type EventStatus =
  | "draft"
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled"
  | "suspended";

export type EventVisibility = "public" | "unlisted" | "private";

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
  category?: string | null;
  image_url?: string | null;
  venue_address?: string | null;
}

export interface OrganizerEvent extends Event {
  phase: EventStatus;
}

export interface EventActivity {
  id: string;
  timestamp: string;
  actor: string | null;
  action: string;
  details: string | null;
}

export interface EventStaffAssignment {
  id: string;
  email: string;
  full_name: string;
  is_suspended: boolean;
  status: "active" | "invited" | "revoked";
}

/** An event from GET /api/staff/events (full events row). */
export interface StaffEvent extends Event {
  end_time: string | null;
  venue_address: string | null;
}

export interface EventDetails extends Event {
  ticket_types: TicketType[];
  end_time: string | null;
  venue_address: string | null;
  description: string | null;
  category: string | null;
  visibility: EventVisibility;
  image_url: string | null;
  refund_policy: string | null;
  paid_sales_suspended: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
}

/** Mobile summary of the current, unfiltered organizer analytics response. */
export interface EventAnalytics {
  inventory: { total: number; sold: number; remaining: number; percent_sold: number; reserved: number; general_admission_reserved?: number };
  money: {
    net_revenue: number | string;
    refunds: number | string;
    processing_fee_simulated: number | string;
    estimated_payout: number | string;
    payout_status: string;
  };
  attendance: { registered: number; checked_in: number; absent: number; percent_checked_in: number };
}
