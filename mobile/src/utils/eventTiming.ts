import type { StaffEvent } from "../types/event";

export type EventTiming = "today" | "upcoming" | "past";

function eventDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return value("year") * 10000 + value("month") * 100 + value("day");
}

/**
 * Where an event sits for door staff, in the website's Almaty event time zone:
 * "today" if it starts today or is still running (started earlier, end time not
 * passed yet), "upcoming" for a later day, "past" otherwise.
 */
export function getEventTiming(event: StaffEvent, now = new Date()): EventTiming {
  const start = new Date(event.start_time);
  if (Number.isNaN(start.getTime())) return "upcoming";

  const today = eventDay(now);
  const startDay = eventDay(start);
  if (startDay > today) return "upcoming";
  if (startDay === today) return "today";

  const end = event.end_time ? new Date(event.end_time) : null;
  if (end && !Number.isNaN(end.getTime()) && end >= now) return "today";
  return "past";
}
