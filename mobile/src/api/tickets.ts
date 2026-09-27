import type { Ticket } from "../types/ticket";
import { request } from "./client";

export function getMyTickets(attendeeId: string, signal?: AbortSignal): Promise<Ticket[]> {
  return request<Ticket[]>(
    `/api/tickets/my-tickets?attendee_id=${encodeURIComponent(attendeeId)}`,
    signal,
  );
}
