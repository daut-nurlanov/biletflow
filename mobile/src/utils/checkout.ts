import type { EventDetails } from "../types/event";
import type { OrderQuote, QuoteInput } from "../types/order";

export const QUOTE_LIFETIME_MS = 60_000;

export function selectionError(event: EventDetails, input: QuoteInput): string | null {
  const type = event.ticket_types.find((item) => item.id === input.ticket_type_id);
  if (!type) return "Choose a ticket type.";
  if (type.is_hidden) return "This ticket type is not available.";
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return "Quantity must be a whole number of at least one.";
  if (type.quantity_available < input.quantity) return type.quantity_available <= 0 ? "This ticket type is sold out." : `Only ${type.quantity_available} tickets remain.`;
  if (input.quantity > type.max_per_order) return `Choose at most ${type.max_per_order} tickets.`;
  if (event.status !== "upcoming" && event.status !== "active") return "This event is not on sale.";
  if (Number(type.price) > 0 && (!event.is_paid_sales_active || event.paid_sales_suspended)) return "Paid sales are unavailable for this event.";
  if (event.has_assigned_seating) return "Assigned-seat checkout is not available in this app. Choose a general-admission event.";
  return null;
}

export function sameQuote(a: OrderQuote, b: OrderQuote): boolean {
  return a.quantity === b.quantity && a.currency === b.currency &&
    ["unit_price", "subtotal", "discount", "total", "processing_fee"].every(
      (key) => Number(a[key as keyof OrderQuote]) === Number(b[key as keyof OrderQuote]),
    ) && a.promo_code === b.promo_code;
}
