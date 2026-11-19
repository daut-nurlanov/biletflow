import type { Ticket } from "./ticket";

export interface QuoteInput {
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  promo_code?: string;
}

export interface CheckoutInput extends QuoteInput {
  attendee_name: string;
  simulate_payment?: "success" | "fail";
}

export interface OrderQuote {
  quantity: number;
  unit_price: number | string;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  promo_code: string | null;
  processing_fee: number | string;
  processing_fee_note: string;
  currency: string;
}

export interface Order {
  id: string;
  event_id: string;
  status: "pending" | "paid" | "refunded" | "cancelled" | "failed";
  total_amount: number | string;
  event_title?: string;
  created_at: string;
}

export interface CheckoutResponse {
  order: Order;
  tickets: Ticket[];
  repeated?: boolean;
}

export interface OrderHistoryEntry extends Order {
  event_title: string;
  start_time: string;
  ticket_count: number;
  promo_code_applied: string | null;
}
