import type { Event } from "../types/event";
import type { EventInput, LifecycleAction, TicketTypeInput } from "../types/organizerSetup";
import type { TicketType } from "../types/ticket";
import { apiRequest } from "./client";

export function createEvent(token: string, body: EventInput): Promise<Event> {
  return apiRequest("/api/events", { token, method: "POST", body });
}

export function updateEvent(token: string, id: string, body: Partial<EventInput>): Promise<Event> {
  return apiRequest(`/api/events/${encodeURIComponent(id)}`, { token, method: "PUT", body });
}

export function changeEventStatus(token: string, eventId: string, action: LifecycleAction): Promise<Event> {
  return apiRequest(`/api/events/${encodeURIComponent(eventId)}/${action}`, { token, method: "POST" });
}

export function createTicketType(token: string, eventId: string, body: TicketTypeInput): Promise<TicketType> {
  return apiRequest(`/api/events/${encodeURIComponent(eventId)}/ticket-types`, { token, method: "POST", body });
}

export function updateTicketType(token: string, id: string, body: Partial<TicketTypeInput>): Promise<TicketType> {
  return apiRequest(`/api/ticket-types/${encodeURIComponent(id)}`, { token, method: "PUT", body });
}
