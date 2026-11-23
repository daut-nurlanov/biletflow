import { apiRequest } from "./client";

export interface AppNotification {
  id: string;
  kind: string;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function getNotifications(token: string, signal?: AbortSignal): Promise<AppNotification[]> {
  return apiRequest<AppNotification[]>("/api/notifications", { token, signal });
}

export function markAllNotificationsRead(token: string): Promise<{ marked_read: number }> {
  return apiRequest("/api/notifications/read-all", { method: "POST", token });
}
