import { ApiError } from "../api/client";
import type { CampaignInput, DiscountType, OrderDetail, PromoCampaign } from "../types/organizer";

/** Same format as the website and the scanner, for example "Balcony-B12"; null for general admission. */
export function seatLabel(row: { section: string | null; row_label: string | null; seat_number: string | null }): string | null {
  if (!row.section) return null;
  return `${row.section}-${row.row_label ?? ""}${row.seat_number ?? ""}`;
}

export type OrderAction =
  | { kind: "refund" }
  | { kind: "cancel" }
  | { kind: "none"; reason: string | null };

/**
 * What the organizer may do with an order, following the backend's rules: only a
 * confirmed order with tickets and none used at the door. Paid orders are refunded
 * in full (simulated); free registrations are cancelled.
 */
export function orderAction(order: Pick<OrderDetail, "status" | "total_amount" | "tickets">): OrderAction {
  if (order.status !== "paid") return { kind: "none", reason: null };
  if (order.tickets.some((ticket) => ticket.status === "checked_in")) {
    return { kind: "none", reason: "Tickets in this order were already used at the door, so it can't be refunded or cancelled." };
  }
  if (order.tickets.length === 0) return { kind: "none", reason: "This order has no tickets." };
  return Number(order.total_amount) > 0 ? { kind: "refund" } : { kind: "cancel" };
}

const BACKEND_MESSAGES: Record<string, string> = {
  "Some tickets were already used at the door, so the order cannot be refunded":
    "Tickets in this order have already been used. A refund is not available.",
  "Some tickets were already used at the door":
    "Tickets in this order have already been used. Cancellation is not available.",
  "This is a free registration, use cancel instead of refund":
    "This is a free registration. Use Cancel registration instead.",
  "This order was paid for, ask the organizer for a refund":
    "This order was paid for. Use Refund instead.",
};

/** Readable error text, matching the website's wording. */
export function organizerMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) return "You don't have access to this event's information.";
    if (error.status === 404) return "Not found, or not available to your account.";
    return BACKEND_MESSAGES[error.message] ?? error.message;
  }
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}

export function discountLabel(campaign: Pick<PromoCampaign, "discount_type" | "discount_value">): string {
  const value = Number(campaign.discount_value);
  const amount = Number.isFinite(value) ? value.toLocaleString() : String(campaign.discount_value);
  return campaign.discount_type === "percentage" ? `${amount}% off` : `${amount} KZT off`;
}

export function usageLabel(campaign: Pick<PromoCampaign, "redemptions_count" | "max_redemptions">): string {
  const used = campaign.redemptions_count ?? 0;
  const left = Math.max(0, campaign.max_redemptions - used);
  return `${used} of ${campaign.max_redemptions} used · ${left === 0 ? "none left" : `${left} left`}`;
}

export interface CampaignForm {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  maxRedemptions: string;
}

/**
 * Checks the form before sending, with the backend's own rules, so the organizer
 * gets the message straight away. The backend checks again; it decides.
 */
export function campaignInput(form: CampaignForm): { input: CampaignInput } | { error: string } {
  const code = form.code.trim().toUpperCase();
  if (code && (code.length > 40 || !/^[A-Z0-9_-]+$/.test(code))) {
    return { error: "A code can only use letters, digits, - and _ (at most 40 characters). Leave it empty to generate one." };
  }
  const value = Number(form.discountValue.trim().replace(",", "."));
  if (!form.discountValue.trim() || !Number.isFinite(value) || value <= 0) {
    return { error: "Enter a discount above 0." };
  }
  if (form.discountType === "percentage" && value > 100) return { error: "A percentage discount can be at most 100." };
  const max = Number(form.maxRedemptions.trim());
  if (!Number.isInteger(max) || max < 1) return { error: "Max uses must be a whole number, at least 1." };
  return {
    input: {
      ...(code ? { code } : {}),
      discount_type: form.discountType,
      discount_value: value,
      max_redemptions: max,
    },
  };
}
