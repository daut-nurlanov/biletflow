import { apiRequest } from "./client";

export interface AppNotification {
  id: string;
  kind: string;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
  target_type?: "event" | "organizer_event" | "support" | null;
  target_id?: string | null;
}

export function getNotifications(token: string, signal?: AbortSignal, unreadOnly = false): Promise<AppNotification[]> {
  return apiRequest<AppNotification[]>(unreadOnly ? "/api/notifications?unread_only=true" : "/api/notifications", { token, signal });
}

export function markAllNotificationsRead(token: string): Promise<{ marked_read: number }> {
  return apiRequest("/api/notifications/read-all", { method: "POST", token });
}

export function markNotificationRead(token: string, id: string): Promise<{ is_read: boolean }> {
  return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST", token });
}
