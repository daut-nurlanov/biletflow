import { ApiError } from "../api/client";
import type { VerifyQrResponse } from "../types/checkin";

export type OutcomeTone = "success" | "danger" | "warning";

/** Everything the result screen needs, decided in one place so it can be tested. */
export interface ScanOutcome {
  tone: OutcomeTone;
  /** Short, very large text: what the staff member should do. */
  headline: string;
  message: string;
  attendeeName?: string | null;
  ticketType?: string | null;
  seat?: string | null;
  /** Show "Try again" for the same code (connection problems). */
  retryable: boolean;
  /** Go back to scanning automatically after a few seconds (valid tickets only). */
  autoDismiss: boolean;
}

const RESULTS: Record<string, Pick<ScanOutcome, "tone" | "headline" | "message">> = {
  valid: {
    tone: "success",
    headline: "Valid. Let in",
    message: "Checked in just now.",
  },
  already_checked_in: {
    tone: "danger",
    headline: "Already checked in",
    message: "This ticket has already been used to enter. Don't admit a second person on it.",
  },
  cancelled: {
    tone: "danger",
    headline: "Ticket cancelled",
    message: "This ticket was cancelled and can't be used to enter.",
  },
  refunded: {
    tone: "danger",
    headline: "Ticket refunded",
    message: "This ticket was refunded and can't be used to enter.",
  },
  event_cancelled: {
    tone: "danger",
    headline: "Event cancelled",
    message: "The event for this ticket was cancelled. No one can be checked in.",
  },
  event_suspended: {
    tone: "danger",
    headline: "Event suspended",
    message: "The platform suspended this event. No one can be checked in. Contact the organizer.",
  },
  wrong_event: {
    tone: "danger",
    headline: "Different event",
    message: "This ticket is for another event. It was not checked in.",
  },
};

export function outcomeFromResponse(response: VerifyQrResponse): ScanOutcome {
  const known = RESULTS[response.result];
  const base = known ?? {
    tone: "warning" as const,
    headline: "Check this ticket",
    message: `BiletFlow answered "${response.result}", which this app doesn't recognise. Check the ticket by hand.`,
  };
  return {
    ...base,
    attendeeName: response.attendee_name,
    ticketType: response.ticket_type,
    seat: response.seat,
    retryable: false,
    autoDismiss: response.result === "valid",
  };
}

export function outcomeFromError(error: unknown): ScanOutcome {
  const plain = { retryable: false, autoDismiss: false };

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return {
        ...plain,
        tone: "danger",
        headline: "Not a valid ticket",
        message: "This QR code isn't a BiletFlow ticket. Ask for the ticket QR from the BiletFlow email or PDF.",
      };
    }
    if (error.status === 400 && /promo/i.test(error.message)) {
      return {
        ...plain,
        tone: "warning",
        headline: "Promo QR, not a ticket",
        message: "This is a blue promo campaign code. Ask the guest for their ticket QR instead.",
      };
    }
    if (error.status === 403) {
      return {
        ...plain,
        tone: "danger",
        headline: "Not your event",
        message: "This ticket belongs to an event you aren't assigned to. It was not checked in.",
      };
    }
    if (error.status === 401) {
      return {
        ...plain,
        tone: "warning",
        headline: "Signed out",
        message: "Your session ended. Sign in again to keep scanning.",
      };
    }
    return {
      ...plain,
      tone: "warning",
      headline: "Couldn't check this ticket",
      message: error.message,
      retryable: true,
    };
  }

  // No answer from the backend (Wi-Fi, timeout). The check-in may still have
  // happened on the server, so explain what a retry might say.
  const reason = error instanceof Error ? error.message : "Something went wrong.";
  return {
    ...plain,
    tone: "warning",
    headline: "No connection",
    message: `${reason} If a retry says "Already checked in", the first scan went through.`,
    retryable: true,
  };
}
