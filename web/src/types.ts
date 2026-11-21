export type Role = 'attendee' | 'organizer' | 'event_admin' | 'platform_admin'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_email_verified?: boolean
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
  price: string | number // money arrives either as a number or as a string like "5000.00"
  total_quantity: number
  quantity_available: number
  seat_category: string | null
  max_per_order: number
}

export interface Quote {
  subtotal: string | number
  discount: string | number
  total: string | number
  processing_fee?: string | number
}

// exact shape of /api/tickets/my-tickets is checked in /docs, so most fields are optional
export interface MyTicket {
  id: string
  attendee_name?: string
  status?: string
  event_status?: string
  event_title?: string
  title?: string
  event?: { title?: string; start_time?: string; venue_name?: string }
  start_time?: string
  venue_name?: string
  ticket_type_name?: string
  section?: string
  row_label?: string
  seat_number?: string
}

export type SupportCategory =
  | 'ticket_delivery'
  | 'payment'
  | 'refund'
  | 'seating'
  | 'event_information'
  | 'check_in'
  | 'account'
  | 'activation'
  | 'technical'

export type SupportStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'

export interface SupportMessage {
  id: string
  case_id: string
  sender_id: string
  message: string
  created_at: string
  sender_name?: string
}

export interface SupportCase {
  id: string
  opened_by: string
  event_id: string | null
  order_id: string | null
  ticket_id: string | null
  category: SupportCategory
  status: SupportStatus
  created_at: string
  kind: 'attendee' | 'organizer'
  assigned_to: string | null
  escalated: boolean
  updated_at: string
  event_title?: string | null
  opened_by_name?: string
  assigned_to_name?: string | null
  your_role_in_case?: 'owner' | 'handler' | 'admin'
  messages?: SupportMessage[]
}
