export type Role = 'attendee' | 'organizer' | 'event_admin' | 'platform_admin'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
}

export interface EventItem {
  id: string
  title: string
  venue_name: string
  venue_address: string | null
  description: string | null
  category: string | null
  start_time: string
  end_time: string | null
  capacity: number
  status: string
  has_assigned_seating: boolean
  is_paid_sales_active: boolean
  image_url: string | null
  refund_policy: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
}

export interface TicketType {
  id: string
  event_id: string
  name: string
  description: string | null
  price: string | number // деньги приходят то числом, то строкой "5000.00"
  total_quantity: number
  quantity_available: number
  seat_category: string | null
  max_per_order: number
}