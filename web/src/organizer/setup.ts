// The server stores times with a time zone. Organizers type Almaty time (UTC+5).
const ZONE = 'Asia/Almaty'

export function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace(' ', 'T')
}

export function toApiTime(local: string): string | undefined {
  return local ? `${local}:00+05:00` : undefined
}

export interface FullEvent {
  id: string
  title: string
  description: string | null
  category: string | null
  venue_name: string
  venue_address: string | null
  start_time: string
  end_time: string | null
  capacity: number
  visibility: 'public' | 'unlisted' | 'private'
  image_url: string | null
  refund_policy: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  status: string
  is_paid_sales_active: boolean
  paid_sales_suspended: boolean
}

export interface TicketType {
  id: string
  name: string
  description: string | null
  price: number | string
  total_quantity: number
  quantity_available: number
  max_per_order: number
  is_hidden: boolean
  sales_start_time: string | null
  sales_end_time: string | null
}

export interface Campaign {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number | string
  max_redemptions: number
  redemptions_count?: number
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  campaign_link: string
  ticket_type_ids: string[] | null
}
