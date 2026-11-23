import type { Order } from "./order";
import type { TicketStatus } from "./ticket";

type Money = number | string;

/** One ticket from GET /api/events/{id}/attendees. The email belongs to the order's buyer. */
export interface EventAttendee {
  ticket_id: string;
  attendee_name: string;
  email: string;
  ticket_type: string;
  status: TicketStatus;
  section: string | null;
  row_label: string | null;
  seat_number: string | null;
  order_id: string;
  ordered_at: string;
  checked_in_at: string | null;
}

/** One order from GET /api/events/{id}/orders. */
export interface EventOrder {
  id: string;
  event_id: string;
  status: Order["status"];
  total_amount: Money;
  created_at: string;
  email: string;
  full_name: string | null;
  ticket_count: number;
  promo_code_applied: string | null;
}

export interface OrderDetailTicket {
  id: string;
  attendee_name: string;
  ticket_type_name: string;
  status: TicketStatus;
  section: string | null;
  row_label: string | null;
  seat_number: string | null;
}

export interface OrderRefund {
  id: string;
  amount: Money;
  reason: string | null;
  created_at: string;
}

/** GET /api/orders/{id}: the order with its tickets and refunds. */
export interface OrderDetail {
  id: string;
  event_id: string;
  status: Order["status"];
  total_amount: Money;
  created_at: string;
  promo_code_applied: string | null;
  tickets: OrderDetailTicket[];
  refunds: OrderRefund[];
}

export type DiscountType = "percentage" | "fixed";

/** One campaign from GET /api/events/{id}/promo-campaigns. */
export interface PromoCampaign {
  id: string;
  event_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: Money;
  max_redemptions: number;
  redemptions_count: number | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  /** Opens the event page with the code applied. The server prices it; the link can't change a price. */
  campaign_link: string;
  created_at: string;
}

/** Body of POST /api/events/{id}/promo-campaigns. */
export interface CampaignInput {
  code?: string;
  discount_type: DiscountType;
  discount_value: number;
  max_redemptions: number;
  valid_from?: string;
  valid_until?: string;
}
