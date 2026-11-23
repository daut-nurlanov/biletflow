import type { ActivationChecklist, OrganizerProfile } from "../types/organizer";

/** The backend's own limits for the two profile fields. */
export const PHONE_MAX = 40;
export const PAYOUT_MAX = 200;

/** Checks the profile form before saving. Both fields are needed for verification. */
export function profileInput(phone: string, payout: string):
  { input: { contact_phone: string; payout_account_details: string } } | { error: string } {
  const contact = phone.trim();
  const account = payout.trim();
  if (!contact) return { error: "Enter a contact phone." };
  if (contact.length > PHONE_MAX || !/^[+\d][\d\s()+-]*$/.test(contact) || contact.replace(/\D/g, "").length < 7) {
    return { error: "Enter a phone number with at least 7 digits, for example +7 701 123 45 67." };
  }
  if (!account) return { error: "Enter a payout account, for example an IBAN." };
  if (account.length > PAYOUT_MAX) return { error: `The payout account can be at most ${PAYOUT_MAX} characters.` };
  return { input: { contact_phone: contact, payout_account_details: account } };
}

/** Verification needs both details saved on the server, not just typed in. */
export function canVerify(profile: OrganizerProfile): boolean {
  return !profile.paid_sales_verified && Boolean(profile.contact_phone?.trim()) && Boolean(profile.payout_account_details?.trim());
}

/** The checklist items the backend requires before it accepts the fee. */
const PREREQUISITES = ["paid_ticket_type", "identity_verified", "payout_account"];

export type ActivationState =
  | { kind: "active" }
  | { kind: "suspended" }
  | { kind: "no_paid_tickets" }
  | { kind: "blocked"; missing: string[] }
  | { kind: "ready" };

export function activationState(checklist: ActivationChecklist): ActivationState {
  if (checklist.paid_sales_active) return { kind: "active" };
  if (checklist.suspended_by_admin) return { kind: "suspended" };
  const missing = checklist.items.filter((item) => PREREQUISITES.includes(item.key) && !item.done);
  if (missing.some((item) => item.key === "paid_ticket_type")) return { kind: "no_paid_tickets" };
  if (missing.length > 0) return { kind: "blocked", missing: missing.map((item) => item.label) };
  return { kind: "ready" };
}

/** Whether a checklist step can be fixed on the profile screen. */
export function isProfileStep(key: string): boolean {
  return key === "identity_verified" || key === "payout_account";
}
