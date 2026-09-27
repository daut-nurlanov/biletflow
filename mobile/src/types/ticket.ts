export type TicketStatus = "valid" | "checked_in" | "cancelled" | "refunded";

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  // Verified against the live FastAPI JSON: NUMERIC prices serialize as numbers.
  price: number;
  total_quantity: number;
  quantity_available: number;
  seat_category: string | null;
  sales_start_time: string | null;
  sales_end_time: string | null;
}

/** The joined response from GET /api/tickets/my-tickets. */
export interface Ticket {
  id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  seat_id: string | null;
  attendee_name: string;
  qr_code_hash: string;
  status: TicketStatus;
  created_at: string;
  event_title: string;
  start_time: string;
}
