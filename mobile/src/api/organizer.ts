import type { ImageURISource } from "react-native";

import { environment } from "../config/environment";
import type {
  CampaignInput, EventAttendee, EventOrder, OrderDetail, PromoCampaign,
} from "../types/organizer";
import { apiRequest } from "./client";

const eventPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}`;

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value.trim() !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent((value as string).trim())}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}

export interface AttendeeFilters {
  /** Part of the attendee's name or the buyer's email. */
  q?: string;
  status?: string;
}

/** Every ticket of the event, one row per ticket. */
export function getEventAttendees(
  token: string, eventId: string, filters: AttendeeFilters, signal?: AbortSignal,
): Promise<EventAttendee[]> {
  return apiRequest(withQuery(`${eventPath(eventId)}/attendees`, { q: filters.q, status: filters.status }), { token, signal });
}

export function getEventOrders(
  token: string, eventId: string, status: string | undefined, signal?: AbortSignal,
): Promise<EventOrder[]> {
  return apiRequest(withQuery(`${eventPath(eventId)}/orders`, { status }), { token, signal });
}

export function getOrderDetail(token: string, orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
  return apiRequest(`/api/orders/${encodeURIComponent(orderId)}`, { token, signal });
}

/** Full simulated refund of a paid order. Free orders are cancelled instead. */
export function refundOrder(token: string, orderId: string, reason: string | null): Promise<unknown> {
  return apiRequest(`/api/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST", token, body: { reason },
  });
}

/** Cancels a free registration. The organizer may cancel anyone's. */
export function cancelRegistration(token: string, orderId: string): Promise<unknown> {
  return apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST", token });
}

export function getPromoCampaigns(token: string, eventId: string, signal?: AbortSignal): Promise<PromoCampaign[]> {
  return apiRequest(`${eventPath(eventId)}/promo-campaigns`, { token, signal });
}

export function createPromoCampaign(token: string, eventId: string, input: CampaignInput): Promise<PromoCampaign> {
  return apiRequest(`${eventPath(eventId)}/promo-campaigns`, { method: "POST", token, body: input });
}

export function setPromoCampaignActive(token: string, campaignId: string, active: boolean): Promise<PromoCampaign> {
  return apiRequest(`/api/promo-campaigns/${encodeURIComponent(campaignId)}/${active ? "enable" : "disable"}`, {
    method: "POST", token,
  });
}

/** The blue campaign QR. It needs the organizer's token, so it is sent as an image header. */
export function promoQrImageSource(token: string, campaignId: string): ImageURISource {
  return {
    uri: `${environment.apiBaseUrl}/api/promo-campaigns/${encodeURIComponent(campaignId)}/qr.png`,
    headers: { Authorization: `Bearer ${token}` },
  };
}
