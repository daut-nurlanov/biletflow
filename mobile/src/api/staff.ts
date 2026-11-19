import type { EventStaffAssignment, StaffEvent } from "../types/event";
import { apiRequest } from "./client";

/**
 * Events this account may scan, ordered by start time. Door staff see only the
 * events they're assigned to; organizers see their own; platform admins see all.
 */
export function getStaffEvents(token: string, signal?: AbortSignal): Promise<StaffEvent[]> {
  return apiRequest<StaffEvent[]>("/api/staff/events", { token, signal });
}

export function getEventStaff(token: string, eventId: string, signal?: AbortSignal): Promise<EventStaffAssignment[]> {
  return apiRequest(`/api/events/${encodeURIComponent(eventId)}/staff`, { token, signal });
}

export function assignExistingStaff(token: string, eventId: string, email: string): Promise<{ already_assigned: boolean }> {
  return apiRequest(`/api/events/${encodeURIComponent(eventId)}/staff`, {
    token, method: "POST", body: { email, mode: "assign" },
  });
}

export function revokeEventStaff(token: string, eventId: string, staffId: string): Promise<{ message: string }> {
  return apiRequest(`/api/events/${encodeURIComponent(eventId)}/staff/${encodeURIComponent(staffId)}`, {
    token, method: "DELETE",
  });
}
