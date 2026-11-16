import type { TicketStatus } from "./ticket";

/** Current POST /api/checkin/verify-qr results. Wrong-event responses omit personal data. */
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
  ticket_id?: string;
  attendee_name?: string | null;
  ticket_type?: string | null;
  /** "<section>-<row><seat>" on assigned-seating events (for example "Balcony-B12"), otherwise null. */
  seat?: string | null;
}

export interface AttendanceStats {
  registered: number;
  checked_in: number;
  not_arrived: number;
  percent_checked_in: number;
}

export interface SearchTicket {
  id: string;
  attendee_name: string;
  status: TicketStatus;
  qr_code_hash: string;
  ticket_type_name: string;
  section: string | null;
  row_label: string | null;
  seat_number: string | null;
}
