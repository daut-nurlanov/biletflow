import type { EventItem } from '../types'

export type Money = number | string
export type Phase =
  | 'draft'
  | 'upcoming'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'suspended'
export interface ManagedEvent extends EventItem {
  phase: Phase
  tickets_total: number
  tickets_sold: number
  tickets_checked_in: number
  net_revenue: Money
}
export interface Attendee {
  ticket_id: string
  attendee_name: string
  email: string
  ticket_type: string
  status: string
  section: string | null
  row_label: string | null
  seat_number: string | null
  order_id: string
  ordered_at: string
  checked_in_at: string | null
}
export interface Order {
  id: string
  event_id: string
  total_amount: Money
  status: string
  created_at: string
  email: string
  full_name: string
  ticket_count: number
  promo_code_applied: string | null
}
export interface OrderTicket {
  id: string
  attendee_name: string
  ticket_type_name: string
  status: string
  section: string | null
  row_label: string | null
  seat_number: string | null
}
export interface OrderDetail
  extends Omit<Order, 'email' | 'full_name' | 'ticket_count'> {
  tickets: OrderTicket[]
  refunds: {
    id: string
    amount: Money
    reason: string | null
    created_at: string
  }[]
}
