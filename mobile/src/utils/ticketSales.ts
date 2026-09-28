import type { TicketType } from "../types/ticket";
import { formatDateTime } from "./formatting";

type Inventory = Pick<TicketType, "total_quantity" | "quantity_available">;

export interface SalesSummary {
  /** Tickets offered across the counted ticket types, sold or not. */
  total: number;
  sold: number;
  remaining: number;
  /** Exact share sold, 0–100, for drawing meters. Use formatPercentSold for text. */
  percentSold: number;
}

function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * Sold means issued: total_quantity minus quantity_available. Checkout lowers
 * quantity_available by one per ticket, so this follows the server's inventory.
 */
export function summarizeInventory({ total_quantity, quantity_available }: Inventory): SalesSummary {
  const total = Math.max(0, total_quantity);
  const remaining = Math.min(total, Math.max(0, quantity_available));
  const sold = total - remaining;
  return { total, sold, remaining, percentSold: percentOf(sold, total) };
}

export function summarizeTicketSales(ticketTypes: Inventory[]): SalesSummary {
  const totals = ticketTypes.map(summarizeInventory).reduce(
    (sum, next) => ({
      total: sum.total + next.total,
      sold: sum.sold + next.sold,
      remaining: sum.remaining + next.remaining,
    }),
    { total: 0, sold: 0, remaining: 0 },
  );
  return { ...totals, percentSold: percentOf(totals.sold, totals.total) };
}

/** Whole percentages that never round a first sale down to 0% or an unsold seat up to 100%. */
export function formatPercentSold({ sold, total }: Pick<SalesSummary, "sold" | "total">): string {
  if (total <= 0) return "0%";
  const percent = percentOf(sold, total);
  if (sold > 0 && percent < 1) return "<1%";
  if (sold < total && percent > 99) return ">99%";
  return `${Math.round(percent)}%`;
}

export function describeSalesWindow(start: string | null, end: string | null): string | null {
  if (start && end) return `On sale ${formatDateTime(start)} – ${formatDateTime(end)}`;
  if (start) return `On sale from ${formatDateTime(start)}`;
  if (end) return `On sale until ${formatDateTime(end)}`;
  return null;
}
