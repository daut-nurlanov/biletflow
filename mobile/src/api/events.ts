import type { Event, EventDetails } from "../types/event";
import { request } from "./client";

export function getEvents(signal?: AbortSignal): Promise<Event[]> {
  // TODO: agree public-event visibility with the backend team. Keep the current
  // server order and statuses, including drafts, without inventing client rules.
  return request<Event[]>("/api/events", signal);
}

export function getEvent(eventId: string, signal?: AbortSignal): Promise<EventDetails> {
  return request<EventDetails>(`/api/events/${encodeURIComponent(eventId)}`, signal);
}

/** Every event the organizer owns, in server order and with every status, drafts included. */
export function getOrganizerEvents(organizerId: string, signal?: AbortSignal): Promise<Event[]> {
  return request<Event[]>(
    `/api/events?organizer_id=${encodeURIComponent(organizerId)}`,
    signal,
  );
}
