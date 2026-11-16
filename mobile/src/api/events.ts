import type { Event, EventAnalytics, EventDetails } from "../types/event";
import { apiRequest } from "./client";

export function getEvents(signal?: AbortSignal, token?: string): Promise<Event[]> {
  return apiRequest<Event[]>("/api/events?public=true", { signal, token });
}

export function getEventAnalytics(eventId: string, token: string, signal?: AbortSignal): Promise<EventAnalytics> {
  return apiRequest<EventAnalytics>(`/api/events/${encodeURIComponent(eventId)}/analytics`, { token, signal });
}

export function getEvent(eventId: string, signal?: AbortSignal, token?: string): Promise<EventDetails> {
  return apiRequest<EventDetails>(`/api/events/${encodeURIComponent(eventId)}`, { signal, token });
}

/** The authenticated organizer's own events, including private drafts. */
export function getOrganizerEvents(token: string, signal?: AbortSignal): Promise<Event[]> {
  return apiRequest<Event[]>("/api/organizer/events", { token, signal });
}
