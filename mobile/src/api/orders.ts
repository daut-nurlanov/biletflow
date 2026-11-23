import type { CheckoutInput, CheckoutResponse, OrderHistoryEntry, OrderQuote, QuoteInput } from "../types/order";
import { apiRequest } from "./client";

export function quoteOrder(token: string, body: QuoteInput, signal?: AbortSignal): Promise<OrderQuote> {
  return apiRequest("/api/orders/quote", { method: "POST", token, body, signal });
}

export function checkoutOrder(token: string, body: CheckoutInput, key: string, signal?: AbortSignal): Promise<CheckoutResponse> {
  return apiRequest("/api/orders/checkout", {
    method: "POST", token, body, signal, headers: { "Idempotency-Key": key },
  });
}

export function getMyOrders(token: string, signal?: AbortSignal): Promise<OrderHistoryEntry[]> {
  return apiRequest("/api/orders/my-orders", { token, signal });
}

/** Cancels a FREE registration. Paid orders are refunded by the organizer instead. */
export function cancelOrder(token: string, orderId: string): Promise<unknown> {
  return apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST", token });
}
