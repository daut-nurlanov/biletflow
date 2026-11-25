import type { EventDetails, EventStatus, EventVisibility } from "../types/event";
import type { EventInput, LifecycleAction, TicketTypeInput } from "../types/organizerSetup";
import type { TicketType } from "../types/ticket";

type StringFields<T> = { [K in keyof T]-?: string };
export type EventDraft = Omit<StringFields<EventInput>, "visibility"> & { visibility: EventVisibility };
export type TicketTypeDraft = Omit<StringFields<TicketTypeInput>, "is_hidden"> & { is_hidden: boolean };

export const EVENT_CATEGORIES = ["Concert", "Conference", "Workshop", "Sports", "Festival", "Theatre", "Other"];

// Same input timezone as the web organizer form. Never use the device timezone.
const almatyInput = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function localTime(value?: string | null): string {
  if (!value) return "";
  const parts = almatyInput.formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function eventTime(value: string, label: string, original?: string | null): string | undefined {
  const time = value.trim();
  // PUT omits blank optional fields. Also keep the original seconds and offset
  // when the organizer hasn't changed the displayed minute.
  if (!time || (original && time === localTime(original))) return original ?? undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(time);
  const canonical = match && `${match[1]}T${match[2]}:00`;
  const date = canonical && new Date(canonical + "Z");
  if (!date || date.getUTCFullYear() < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== canonical) {
    throw new Error(`${label}: enter a valid date and time as YYYY-MM-DD HH:mm.`);
  }
  return canonical + "+05:00";
}

function ordered(start: string | undefined, end: string | undefined, message: string) {
  if (start && end && Date.parse(end) <= Date.parse(start)) throw new Error(message);
}

function positiveInteger(value: string, label: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value.trim()) || number < 1 || number > 2_147_483_647) {
    throw new Error(`${label} must be a whole number between 1 and 2,147,483,647.`);
  }
  return number;
}

function requiredText(value: string, label: string, limit: number): string {
  const trimmed = value.trim();
  if (!trimmed || Array.from(trimmed).length > limit) {
    throw new Error(`${label} must have 1 to ${limit} characters.`);
  }
  return trimmed;
}

export function eventDraft(event?: EventDetails): EventDraft {
  return {
    title: event?.title ?? "",
    venue_name: event?.venue_name ?? "",
    venue_address: event?.venue_address ?? "",
    start_time: localTime(event?.start_time),
    end_time: localTime(event?.end_time),
    capacity: String(event?.capacity ?? 100),
    category: event ? event.category ?? "" : "Concert",
    description: event?.description ?? "",
    visibility: event?.visibility ?? "public",
    image_url: event?.image_url ?? "",
    refund_policy: event?.refund_policy ?? "",
    registration_opens_at: localTime(event?.registration_opens_at),
    registration_closes_at: localTime(event?.registration_closes_at),
  };
}

export function eventInput(form: EventDraft, original?: EventDetails): EventInput {
  const title = requiredText(form.title, "Title", 200);
  const venue = requiredText(form.venue_name, "Venue name", 200);
  if (!form.start_time.trim()) throw new Error("Enter the event start date and time.");
  const start = eventTime(form.start_time, "Event start", original?.start_time)!;
  const end = eventTime(form.end_time, "Event end", original?.end_time);
  const opens = eventTime(form.registration_opens_at, "Registration opens", original?.registration_opens_at);
  const closes = eventTime(form.registration_closes_at, "Registration closes", original?.registration_closes_at);
  ordered(start, end, "The event must end after it starts.");
  ordered(opens, closes, "Registration must close after it opens.");
  const capacity = positiveInteger(form.capacity, "Capacity");
  const offered = original?.ticket_types.reduce((count, type) => count + type.total_quantity, 0) ?? 0;
  if (capacity < offered) throw new Error(`Your ticket types offer ${offered} tickets. Capacity cannot be lower.`);
  const image = form.image_url.trim();
  if (image && !/^(https?:\/\/[^\s/]+|\/)[^\s]*$/.test(image)) {
    throw new Error("Enter an HTTP or HTTPS image address, or a path beginning with /.");
  }
  return {
    title, venue_name: venue, start_time: start, end_time: end, capacity, visibility: form.visibility,
    venue_address: form.venue_address.trim() || undefined,
    category: form.category.trim() || undefined,
    description: form.description.trim() || undefined,
    image_url: image || undefined,
    refund_policy: form.refund_policy.trim() || undefined,
    registration_opens_at: opens, registration_closes_at: closes,
  };
}

export function ticketTypeDraft(event: EventDetails, type?: TicketType): TicketTypeDraft {
  const remaining = event.capacity - event.ticket_types.reduce((count, item) => count + item.total_quantity, 0);
  return {
    name: type?.name ?? "",
    price: String(Number(type?.price ?? 0)),
    total_quantity: String(type?.total_quantity ?? Math.max(1, Math.min(remaining, 50))),
    max_per_order: String(type?.max_per_order ?? 10),
    description: type?.description ?? "",
    sales_start_time: localTime(type?.sales_start_time),
    sales_end_time: localTime(type?.sales_end_time),
    is_hidden: type?.is_hidden ?? false,
  };
}

export function ticketTypeInput(form: TicketTypeDraft, event: EventDetails, original?: TicketType): TicketTypeInput {
  const name = requiredText(form.name, "Ticket type name", 100);
  const amount = form.price.trim().replace(",", ".");
  const price = Number(amount);
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount) || price > 10_000_000) {
    throw new Error("Price must be between 0 and 10,000,000 KZT with up to two decimal places.");
  }
  const quantity = positiveInteger(form.total_quantity, "Total tickets");
  const maxPerOrder = positiveInteger(form.max_per_order, "Maximum per order");
  const sold = original ? original.total_quantity - original.quantity_available : 0;
  if (quantity < sold) throw new Error(`${sold} tickets are already sold. The total cannot go below ${sold}.`);
  const otherTypes = event.ticket_types.filter((type) => type.id !== original?.id);
  const offered = otherTypes.reduce((count, type) => count + type.total_quantity, quantity);
  if (offered > event.capacity) throw new Error(`The ticket types would offer ${offered} tickets. Event capacity is ${event.capacity}.`);
  const start = eventTime(form.sales_start_time, "Sales start", original?.sales_start_time);
  const end = eventTime(form.sales_end_time, "Sales end", original?.sales_end_time);
  ordered(start, end, "Ticket sales must end after they start.");
  return {
    name, price, total_quantity: quantity, max_per_order: maxPerOrder, is_hidden: form.is_hidden,
    description: form.description.trim() || undefined,
    sales_start_time: start, sales_end_time: end,
  };
}

/** Send changed fields only. Blank optional fields and unchanged timestamps are omitted. */
export function changedSetupFields<T extends object>(input: T, previous: object): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) =>
    value !== undefined && value !== Reflect.get(previous, key),
  )) as Partial<T>;
}

export function canEditSetup(phase: EventStatus): boolean {
  return phase === "draft" || phase === "upcoming" || phase === "active";
}

export function lifecycleActions(phase: EventStatus): LifecycleAction[] {
  switch (phase) {
    case "draft": return ["publish", "cancel"];
    case "upcoming":
    case "active": return ["unpublish", "cancel"];
    case "suspended": return ["cancel"];
    default: return [];
  }
}
