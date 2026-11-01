/**
 * `result` values from POST /api/checkin/verify-qr. "wrong_event" is not sent
 * by the backend yet (see the note in src/api/checkin.ts); it is handled so the
 * app is ready if the backend starts checking the selected event.
 */
export type CheckinResult =
  | "valid"
  | "already_checked_in"
  | "cancelled"
  | "refunded"
  | "event_cancelled"
  | "event_suspended"
  | "wrong_event";

export interface VerifyQrResponse {
  result: CheckinResult | string;
  ticket_id: string;
  attendee_name: string | null;
  ticket_type: string | null;
  /** "<section>-<row><seat>" on assigned-seating events (for example "Balcony-B12"), otherwise null. */
  seat: string | null;
}
