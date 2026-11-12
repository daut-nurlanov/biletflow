import type { StaffEvent } from "../types/event";

export type EventTiming = "today" | "upcoming" | "past";

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Where an event sits for door staff, in the phone's time zone:
 * "today" if it starts today or is still running (started earlier, end time not
 * passed yet), "upcoming" for a later day, "past" otherwise.
 */
export function getEventTiming(event: StaffEvent, now = new Date()): EventTiming {
  const start = new Date(event.start_time);
  if (Number.isNaN(start.getTime())) return "upcoming";

  const todayStart = startOfLocalDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  if (start >= tomorrowStart) return "upcoming";
  if (start >= todayStart) return "today";

  const end = event.end_time ? new Date(event.end_time) : null;
  if (end && !Number.isNaN(end.getTime()) && end >= now) return "today";
  return "past";
}
