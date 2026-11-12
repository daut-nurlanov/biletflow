import type { StaffEvent } from "../types/event";
import { apiRequest } from "./client";

/**
 * Events this account may scan, ordered by start time. Door staff see only the
 * events they're assigned to; organizers see their own; platform admins see all.
 */
export function getStaffEvents(token: string, signal?: AbortSignal): Promise<StaffEvent[]> {
  return apiRequest<StaffEvent[]>("/api/staff/events", { token, signal });
}
