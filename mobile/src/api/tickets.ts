import { environment } from "../config/environment";
import type { Ticket } from "../types/ticket";
import { apiRequest } from "./client";

/** The backend identifies the attendee from the bearer token; no demo ID is needed. */
export function getMyTickets(token: string, signal?: AbortSignal): Promise<Ticket[]> {
  return apiRequest<Ticket[]>("/api/tickets/my-tickets", { token, signal });
}

/** Public ticket-link endpoint; no bearer token or QR hash is required. */
export function getTicketQrImageUrl(ticketId: string): string {
  return `${environment.apiBaseUrl}/api/tickets/${encodeURIComponent(ticketId)}/qr.png`;
}
