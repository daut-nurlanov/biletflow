import type { AttendanceStats, SearchTicket, VerifyQrResponse } from "../types/checkin";
import { apiRequest } from "./client";

/** The server validates permissions, event and ticket status atomically. */
export function verifyQr(
  token: string,
  qrCode: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<VerifyQrResponse> {
  return apiRequest<VerifyQrResponse>("/api/checkin/verify-qr", {
    method: "POST",
    token,
    body: { qr_code_hash: qrCode, event_id: eventId },
    signal,
  });
}

export function getAttendanceStats(token: string, eventId: string, signal?: AbortSignal): Promise<AttendanceStats> {
  return apiRequest<AttendanceStats>(`/api/events/${encodeURIComponent(eventId)}/checkin-stats`, { token, signal });
}

export function searchTickets(token: string, eventId: string, name: string, signal?: AbortSignal): Promise<SearchTicket[]> {
  return apiRequest<SearchTicket[]>("/api/checkin/manual-search", {
    method: "POST", token, signal, body: { event_id: eventId, name: name.trim() },
  });
}

export function undoCheckin(token: string, ticketId: string, signal?: AbortSignal): Promise<{ result: "reversed"; ticket_id: string }> {
  return apiRequest("/api/checkin/undo", { method: "POST", token, signal, body: { ticket_id: ticketId } });
}
