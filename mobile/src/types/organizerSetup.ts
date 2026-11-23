import type { EventVisibility } from "./event";

export interface EventInput {
  title: string;
  venue_name: string;
  start_time: string;
  capacity: number;
  visibility: EventVisibility;
  venue_address?: string;
  end_time?: string;
  category?: string;
  description?: string;
  refund_policy?: string;
  image_url?: string;
  registration_opens_at?: string;
  registration_closes_at?: string;
}

export interface TicketTypeInput {
  name: string;
  price: number;
  total_quantity: number;
  max_per_order: number;
  is_hidden: boolean;
  description?: string;
  sales_start_time?: string;
  sales_end_time?: string;
}

export type LifecycleAction = "publish" | "unpublish" | "cancel";
