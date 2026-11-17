const { load, runtime } = require('./runtime.cjs');

const eventFixture = { id: 'event-1', title: 'Test concert', status: 'upcoming',
  is_paid_sales_active: true, paid_sales_suspended: false, has_assigned_seating: false,
  ticket_types: [{ id: 'paid', name: 'Standard', price: 1000, total_quantity: 10,
    quantity_available: 10, max_per_order: 5, is_hidden: false }] };
const quoteFixture = { quantity: 1, unit_price: 1000, subtotal: 1000, discount: 0,
  total: 1000, promo_code: null, processing_fee: 30, currency: 'KZT' };

function checkoutHarness(options = {}) {
  const hooks = runtime();
  const event = options.event ?? eventFixture;
  const calls = [];
  const store = options.store ?? new Map();
  const locks = options.locks ?? new Set();
  const timers = new Map();
  const clock = options.clock ?? { now: Date.now() };
  class Clock extends Date { static now() { return clock.now; } }
  const ApiError = options.ApiError ?? class extends Error { constructor(message, status) { super(message); this.status = status; } };
  const api = options.api ?? {
    quoteOrder: async (_, body) => ({ ...quoteFixture, quantity: body.quantity,
      subtotal: body.quantity * 1000, total: body.quantity * 1000, promo_code: body.promo_code ?? null }),
    checkoutOrder: async (_, body) => ({ order: { id: 'order-1', status: 'paid', total_amount: body.quantity * 1000 },
      tickets: [{ id: 'ticket-1' }] }),
  };
  const orders = Object.fromEntries(['quoteOrder', 'checkoutOrder'].map((key) => [key, async (...args) => {
    calls.push({ method: key, args }); return api[key](...args);
  }]));
  const session = options.session ?? { state: { status: 'signedIn', user: { id: 'buyer-1', full_name: 'Attendee' } },
    authed: (fn) => fn('current-token') };
  const resource = load('src/hooks/useApiResource.ts', {
    react: hooks.react, '@react-navigation/native': { useFocusEffect: hooks.focus },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  });
  const helpers = load('src/utils/checkout.ts');
  const promotions = options.promotions ?? load('src/api/promotions.ts', {
    './client': { apiRequest: async () => ({ event_id: event.id, promo_code: 'SAVE20' }) },
  });
  const { useCheckout } = load('src/hooks/useCheckout.ts', {
    react: hooks.react, 'expo-crypto': { randomUUID: () => 'attempt-' + Math.random() },
    '../api/client': { ApiError }, '../api/orders': orders, '../api/promotions': promotions,
    '../auth/SessionContext': { useSession: () => session }, './useApiResource': resource,
    '../utils/checkout': helpers,
    '../auth/PurchaseAttempt': {
      acquirePurchaseLock: (_, eventId) => { if (locks.has(eventId)) return null; locks.add(eventId); return () => locks.delete(eventId); },
      readPurchaseAttempt: async () => store.get('attempt') ?? null,
      savePurchaseAttempt: async (_, attempt) => { calls.push({ method: 'save' }); store.set('attempt', attempt); },
      clearPurchaseAttempt: async () => store.delete('attempt'),
    },
  }, { Date: Clock, setTimeout: (callback, ms) => { timers.set(callback, ms); return callback; }, clearTimeout: (id) => timers.delete(id) });
  let view;
  const render = () => { view = hooks.render(() => useCheckout(event, options.initialTypeId ?? 'paid', options.initialCampaignToken)); return view; };
  async function settle() { for (let i = 0; i < 4; i++) { render(); await hooks.flush(); } return render(); }
  return { hooks, event, store, calls, timers, clock, ApiError, render, settle, get view() { return view; } };
}
module.exports = { checkoutHarness, eventFixture, quoteFixture };
