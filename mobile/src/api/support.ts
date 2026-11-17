import type { SupportCase, SupportCategory, SupportContext, SupportMessage, SupportStatus } from "../types/support";
import { apiRequest } from "./client";

export function getSupportCases(token: string, signal?: AbortSignal): Promise<SupportCase[]> {
  return apiRequest("/api/support/cases", { token, signal });
}
export function getSupportCase(token: string, id: string, signal?: AbortSignal): Promise<SupportCase> {
  return apiRequest(`/api/support/cases/${encodeURIComponent(id)}`, { token, signal });
}
export function createSupportCase(token: string, category: SupportCategory, message: string, context: SupportContext): Promise<SupportCase> {
  return apiRequest("/api/support/cases", { method: "POST", token, body: {
    category, message: message.trim(), event_id: context.eventId, ticket_id: context.ticketId, order_id: context.orderId,
  } });
}
export function replyToSupport(token: string, id: string, message: string): Promise<SupportMessage> {
  return apiRequest(`/api/support/cases/${encodeURIComponent(id)}/messages`, { method: "POST", token, body: { message: message.trim() } });
}
export function setSupportStatus(token: string, id: string, status: SupportStatus): Promise<SupportCase> {
  return apiRequest(`/api/support/cases/${encodeURIComponent(id)}`, { method: "PUT", token, body: { status } });
}
export function escalateSupportCase(token: string, id: string): Promise<SupportCase> {
  return apiRequest(`/api/support/cases/${encodeURIComponent(id)}/escalate`, { method: "POST", token });
}
