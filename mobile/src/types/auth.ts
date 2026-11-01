export type UserRole = "attendee" | "organizer" | "event_admin" | "platform_admin";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_email_verified: boolean;
}

export interface LoginResponse extends User {
  token: string;
}

/** Roles the backend lets scan tickets (door staff, plus organizers and admins for their own events). */
export const SCANNER_ROLES: readonly UserRole[] = ["event_admin", "organizer", "platform_admin"];
