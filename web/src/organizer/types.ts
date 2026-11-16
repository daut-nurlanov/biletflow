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

export interface SalesDay {
  day: string
  orders: number
  tickets: number
  revenue: Money
}
export interface Analytics {
  event_id: string
  currency: 'KZT'
  generated_at: string
  filters: {
    date_from: string | null
    date_to: string | null
    ticket_type_id: string | null
  }
  inventory: {
    total: number
    sold: number
    remaining: number
    percent_sold: number
    reserved: number
    reserved_scope: 'event'
  }
  ticket_counts: {
    available: number
    reserved: number
    sold: number
    refunded: number
    checked_in: number
  }
  money: {
    gross_sales: Money
    discounts: Money
    refunds: Money
    net_revenue: Money
    processing_fee_simulated: Money
    estimated_payout: Money
    payout_status: string
  }
  sales_over_time: SalesDay[]
  by_ticket_type: {
    id: string
    name: string
    price: Money
    total_quantity: number
    remaining: number
    sold: number
    refunded: number
    revenue_at_list_price: Money
  }[]
  campaigns: {
    id: string
    code: string
    is_active: boolean
    max_redemptions: number
    active_redemptions_all_dates: number
    redemptions: number
    orders: number
    refunded_orders: number
    tickets: number
    gross_sales: Money
    discounts: Money
    refunds: Money
    net_revenue: Money
  }[]
  attendance: {
    registered: number
    checked_in: number
    absent: number
    percent_checked_in: number
  }
}

export interface StaffMember {
  id: string
  email: string
  full_name: string
  status: 'active' | 'revoked'
  is_suspended: boolean
}
