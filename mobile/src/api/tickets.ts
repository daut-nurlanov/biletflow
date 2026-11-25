import type { Ticket } from "../types/ticket";
import { apiRequest, requestBlob, requestPdf } from "./client";

/** The backend identifies the attendee from the bearer token; no demo ID is needed. */
export function getMyTickets(token: string, signal?: AbortSignal): Promise<Ticket[]> {
  return apiRequest<Ticket[]>("/api/tickets/my-tickets", { token, signal });
}

export function getTicketQr(ticketId: string, token: string, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/api/tickets/${encodeURIComponent(ticketId)}/qr.png`, "image/png", token, signal);
}

export function getTicketPdf(ticketId: string, token: string, signal?: AbortSignal): Promise<Uint8Array> {
  return requestPdf(`/api/tickets/${encodeURIComponent(ticketId)}/pdf`, token, signal);
}
