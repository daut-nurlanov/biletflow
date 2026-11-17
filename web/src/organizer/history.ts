export const historyActions: Record<string, string> = {
  event_created: 'Event created',
  event_updated: 'Event updated',
  event_published: 'Event published',
  event_unpublished: 'Event unpublished',
  event_cancelled: 'Event cancelled',
  event_duplicated: 'Created from another event',
  event_duplicated_from: 'Event copied to a new draft',
  capacity_changed: 'Event capacity changed',
  ticket_type_created: 'Ticket type created',
  ticket_price_changed: 'Ticket price changed',
  ticket_quantity_changed: 'Ticket quantity changed',
  ticket_type_hidden: 'Ticket type hidden',
  ticket_type_shown: 'Ticket type shown',
  order_paid: 'Order confirmed',
  payment_failed: 'Payment failed',
  order_refunded: 'Order refunded',
  registration_cancelled: 'Free registration cancelled',
  check_in: 'Attendee checked in',
  check_in_reversed: 'Check-in reversed',
  promo_created: 'Campaign created',
  promo_enabled: 'Campaign enabled',
  promo_disabled: 'Campaign disabled',
  staff_assigned: 'Staff assigned',
  staff_revoked: 'Staff access revoked',
  support_case_status_changed: 'Support status changed',
  support_case_escalated: 'Support case escalated',
  paid_sales_activated: 'Paid sales activated',
  paid_sales_suspended: 'Paid sales suspended',
  paid_sales_restored: 'Paid sales restored',
  event_suspended: 'Event suspended',
  event_reinstated: 'Event reinstated',
  payout_status_changed: 'Payout status changed',
  event_report_reviewed: 'Event report reviewed',
}
export function actionLabel(action: string) {
  return Object.hasOwn(historyActions, action)
    ? historyActions[action]
    : action
        .replaceAll('_', ' ')
        .trim()
        .replace(/^./, (letter) => letter.toUpperCase()) || 'Other activity'
}
export const historyMoment = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Almaty',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
