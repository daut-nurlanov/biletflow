export function analyticsFixture(params) {
  const vip = params.get('ticket_type_id') === 'type-2'
  const empty = params.get('date_from') === '2099-01-01'
  const data = {
    event_id: 'event-1',
    currency: 'KZT',
    generated_at: '2029-04-12T15:30:00+05:00',
    filters: {
      date_from: params.get('date_from'),
      date_to: params.get('date_to'),
      ticket_type_id: params.get('ticket_type_id'),
    },
    inventory: {
      total: vip ? 10 : 30,
      sold: vip ? 1 : 6,
      remaining: vip ? 9 : 24,
      percent_sold: vip ? 10 : 20,
      reserved: 1,
      reserved_scope: 'event',
    },
    ticket_counts: {
      available: vip ? 9 : 24,
      reserved: 1,
      sold: vip ? 1 : 4,
      refunded: vip ? 0 : 2,
      checked_in: vip ? 0 : 1,
    },
    money: {
      gross_sales: vip ? 5000 : 10000,
      discounts: vip ? 500 : 1000,
      refunds: vip ? 0 : 1800,
      net_revenue: vip ? 4500 : 7200,
      processing_fee_simulated: vip ? 135 : 216,
      estimated_payout: vip ? 4365 : 6984,
      payout_status: 'pending',
    },
    attendance: {
      registered: vip ? 1 : 4,
      checked_in: vip ? 0 : 1,
      absent: vip ? 1 : 3,
      percent_checked_in: vip ? 0 : 25,
    },
    sales_over_time: [
      ...(!vip
        ? [{ day: '2029-04-10', orders: 1, tickets: 3, revenue: 2700 }]
        : []),
      { day: '2029-04-12', orders: 1, tickets: 1, revenue: 4500 },
    ],
    by_ticket_type: [
      ...(!vip
        ? [
            {
              id: 'type-1',
              name: 'Standard',
              price: 1000,
              total_quantity: 20,
              remaining: 15,
              sold: 3,
              refunded: 2,
              revenue_at_list_price: 3000,
            },
          ]
        : []),
      {
        id: 'type-2',
        name: 'VIP',
        price: 5000,
        total_quantity: 10,
        remaining: 9,
        sold: 1,
        refunded: 0,
        revenue_at_list_price: 5000,
      },
    ],
    campaigns: [
      {
        id: 'campaign-1',
        code: 'SPRING',
        is_active: true,
        max_redemptions: 20,
        active_redemptions_all_dates: 4,
        redemptions: vip ? 1 : 2,
        orders: vip ? 1 : 3,
        refunded_orders: vip ? 0 : 1,
        tickets: vip ? 1 : 4,
        gross_sales: vip ? 5000 : 10000,
        discounts: vip ? 500 : 1000,
        refunds: vip ? 0 : 1800,
        net_revenue: vip ? 4500 : 7200,
      },
    ],
  }
  if (empty) {
    data.sales_over_time = []
    data.by_ticket_type = data.by_ticket_type.map((type) => ({
      ...type,
      sold: 0,
      refunded: 0,
      revenue_at_list_price: 0,
    }))
    data.campaigns = data.campaigns.map((campaign) => ({
      ...campaign,
      redemptions: 0,
      orders: 0,
      refunded_orders: 0,
      tickets: 0,
      gross_sales: 0,
      discounts: 0,
      refunds: 0,
      net_revenue: 0,
    }))
    data.money = {
      ...data.money,
      gross_sales: 0,
      discounts: 0,
      refunds: 0,
      net_revenue: 0,
      processing_fee_simulated: 0,
      estimated_payout: 0,
    }
    data.attendance = {
      registered: 0,
      checked_in: 0,
      absent: 0,
      percent_checked_in: 0,
    }
    data.ticket_counts = {
      ...data.ticket_counts,
      sold: 0,
      refunded: 0,
      checked_in: 0,
    }
  }
  if (params.get('ticket_type_id') === 'type-free') {
    data.inventory = {
      total: 20,
      sold: 2,
      remaining: 18,
      percent_sold: 10,
      reserved: 0,
      reserved_scope: 'event',
    }
    data.ticket_counts = {
      available: 18,
      reserved: 0,
      sold: 2,
      refunded: 0,
      checked_in: 0,
    }
    data.money = {
      ...data.money,
      gross_sales: 0,
      discounts: 0,
      refunds: 0,
      net_revenue: 0,
      processing_fee_simulated: 0,
      estimated_payout: 0,
    }
    data.attendance = {
      registered: 2,
      checked_in: 0,
      absent: 2,
      percent_checked_in: 0,
    }
    data.sales_over_time = [
      { day: '2029-04-10', orders: 1, tickets: 2, revenue: 0 },
    ]
    data.by_ticket_type = [
      {
        id: 'type-free',
        name: 'Free admission',
        price: 0,
        total_quantity: 20,
        remaining: 18,
        sold: 2,
        refunded: 0,
        revenue_at_list_price: 0,
      },
    ]
    data.campaigns = []
  }
  return data
}
