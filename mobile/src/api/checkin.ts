import type { VerifyQrResponse } from "../types/checkin";
import { apiRequest } from "./client";

/**
 * Checks a scanned ticket and, if it is valid, checks the person in.
 *
 * Known backend gap: the endpoint only reads `qr_code_hash` and checks the ticket
 * in to whichever event it belongs to, as long as this account may scan that
 * event. So a staff member assigned to several events can admit a ticket for
 * event B while standing at event A's door. `event_id` is sent so the backend can
 * refuse that case (answering result "wrong_event") once it reads the field;
 * today FastAPI ignores it. Reported to the backend team per docs/TASKS.md.
 */
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
