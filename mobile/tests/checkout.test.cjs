const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./runtime.cjs');
const { checkoutHarness, eventFixture, quoteFixture } = require('./checkout-runtime.cjs');

test('quantity, stock, order limits, sales restrictions and assigned seating prevent invalid checkout', () => {
  const { selectionError } = load('src/utils/checkout.ts');
  const input = { event_id: 'event-1', ticket_type_id: 'paid', quantity: 1 };
  assert.equal(selectionError(eventFixture, input), null);
  for (const quantity of [0, -1, 1.5, NaN, 11, 6]) assert.ok(selectionError(eventFixture, { ...input, quantity }));
  assert.ok(selectionError({ ...eventFixture, status: 'cancelled' }, input));
  assert.ok(selectionError({ ...eventFixture, paid_sales_suspended: true }, input));
  assert.ok(selectionError({ ...eventFixture, is_paid_sales_active: false }, input));
  assert.ok(selectionError({ ...eventFixture, has_assigned_seating: true }, input));
});

test('a new selection invalidates old totals and quote expiry disables purchase until refreshed', async () => {
  const h = checkoutHarness(); await h.settle();
  assert.equal(h.view.canBuy, true);
  h.view.change({ quantity: 2 }); h.render();
  assert.equal(h.view.reviewed, null); assert.equal(h.view.canBuy, false);
  await h.settle(); assert.equal(h.view.reviewed.value.total, 2000);
  h.clock.now += 60001;
  for (const callback of [...h.timers.keys()]) callback();
  h.render(); assert.equal(h.view.expired, true); assert.equal(h.view.canBuy, false);
  h.view.quotes.retry(); await h.settle(); assert.equal(h.view.canBuy, true);
  h.hooks.cleanup();
});

test('promo code and campaign link resolve on the server, reject another event and recalculate quote', async () => {
  const h = checkoutHarness(); await h.settle();
  await h.view.applyPromo('https://example.test/events/event-1?c=campaign-token'); await h.settle();
  assert.equal(h.view.form.promo, 'SAVE20'); assert.equal(h.view.reviewed.value.promo_code, 'SAVE20');
  await h.view.applyPromo(''); await h.settle(); assert.equal(h.view.form.promo, '');
  const wrong = checkoutHarness({ promotions: { campaignTokenFromInput: () => 'token',
    resolveCampaign: async () => ({ event_id: 'foreign', promo_code: 'WRONG' }) } });
  await wrong.settle(); await wrong.view.applyPromo('link'); await wrong.settle();
  assert.match(wrong.view.error, /different event/); assert.equal(wrong.view.form.promo, '');
  h.hooks.cleanup(); wrong.hooks.cleanup();
});

test('checkout revalidates changed prices and never submits an unreviewed total', async () => {
  let total = 1000, purchases = 0;
  const h = checkoutHarness({ api: { quoteOrder: async () => ({ ...quoteFixture, total }),
    checkoutOrder: async () => { purchases++; return {}; } } });
  await h.settle(); total = 1200;
  await h.view.purchase(); await h.settle();
  assert.equal(purchases, 0); assert.match(h.view.error, /price changed/);
  assert.equal(h.view.reviewed.value.total, 1200); h.hooks.cleanup();
});

test('double submission is locked and free/paid success requires confirmed tickets', async () => {
  for (const price of [0, 1000]) {
    let finish;
    const h = checkoutHarness({ api: {
      quoteOrder: async () => ({ ...quoteFixture, unit_price: price, subtotal: price, total: price, processing_fee: price * .03 }),
      checkoutOrder: async () => new Promise((resolve) => { finish = resolve; }),
    } });
    await h.settle(); const submit = h.view.purchase;
    const pending = submit(); await submit(); await h.hooks.flush();
    assert.equal(h.calls.filter((c) => c.method === 'checkoutOrder').length, 1);
    assert.ok(h.calls.findIndex((c) => c.method === 'save') < h.calls.findIndex((c) => c.method === 'checkoutOrder'));
    finish({ order: { id: 'order-1', status: 'paid', total_amount: price }, tickets: [{ id: 'ticket-1' }] });
    await pending; await h.settle();
    assert.equal(h.view.confirmation.order.total_amount, price); assert.equal(h.store.size, 0);
    h.hooks.cleanup();
  }
});

test('lost responses survive screen remount and retry the original payload/key without a new purchase', async () => {
  const store = new Map();
  const first = checkoutHarness({ store, api: { quoteOrder: async () => quoteFixture,
    checkoutOrder: async () => { throw new Error('Connection lost after submission'); } } });
  await first.settle(); await first.view.purchase(); await first.settle();
  const attempt = store.get('attempt'); assert.ok(attempt); assert.equal(first.view.confirmation, null);
  first.view.change({ quantity: 3 }); first.render(); assert.equal(first.view.form.quantity, 1);
  first.hooks.cleanup();
  const restored = checkoutHarness({ store }); await restored.settle(); await restored.view.purchase(); await restored.settle();
  const sent = restored.calls.find((c) => c.method === 'checkoutOrder');
  assert.equal(sent.args[2], attempt.key); assert.equal(sent.args[1], attempt.body);
  assert.equal(restored.view.confirmation.order.id, 'order-1'); restored.hooks.cleanup();
});

test('malformed success and unexpected server errors keep the attempt recoverable without fake confirmation', async () => {
  const h = checkoutHarness({ api: { quoteOrder: async () => quoteFixture,
    checkoutOrder: async () => ({ order: { id: 'order-1', status: 'paid' }, tickets: [] }) } });
  await h.settle(); await h.view.purchase(); await h.settle();
  assert.equal(h.view.confirmation, null); assert.ok(h.view.attempt); assert.match(h.view.error, /did not confirm/);
  h.hooks.cleanup();
});

test('idempotency key and authorization are sent through the actual shared fetch client', async () => {
  let sent;
  const client = load('src/api/client.ts', { '../config/environment': { environment: { apiBaseUrl: 'https://test.invalid' } } }, {
    fetch: async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({}) }; },
  });
  const orders = load('src/api/orders.ts', { './client': client });
  await orders.checkoutOrder('signed-in-token', { event_id: 'event-1', ticket_type_id: 'paid', quantity: 1, attendee_name: 'Attendee' }, 'stable-key');
  assert.equal(sent.url, 'https://test.invalid/api/orders/checkout');
  assert.equal(sent.options.headers.Authorization, 'Bearer signed-in-token');
  assert.equal(sent.options.headers['Idempotency-Key'], 'stable-key');
});

test('invalid promo quotes block purchase and definitive payment failure allows correction without confirming success', async () => {
  let failPayment = true;
  const h = checkoutHarness({ api: {
    quoteOrder: async (_, input) => {
      if (input.promo_code === 'INVALID') throw new h.ApiError('Invalid promo code', 404);
      return quoteFixture;
    },
    checkoutOrder: async () => {
      if (failPayment) throw new h.ApiError('Payment failed. No tickets were issued and you were not charged.', 402);
      return { order: { id: 'paid-1', status: 'paid' }, tickets: [{ id: 'ticket-1' }] };
    },
  } });
  await h.settle(); await h.view.applyPromo('INVALID'); await h.settle();
  assert.equal(h.view.canBuy, false); assert.match(h.view.quotes.error, /Invalid promo/);
  await h.view.applyPromo(''); await h.settle(); await h.view.purchase(); await h.settle();
  assert.equal(h.view.confirmation, null); assert.equal(h.view.attempt, null); assert.equal(h.store.size, 0);
  failPayment = false; await h.view.purchase(); await h.settle();
  assert.equal(h.view.confirmation.order.id, 'paid-1'); h.hooks.cleanup();
});

test('server 500 retains its retry key and expired authentication never confirms a purchase', async () => {
  for (const status of [500, 401]) {
    const h = checkoutHarness({ api: { quoteOrder: async () => quoteFixture,
      checkoutOrder: async () => { throw new h.ApiError('Server unavailable', status); } } });
    await h.settle(); await h.view.purchase(); await h.settle();
    assert.equal(h.view.confirmation, null); assert.ok(h.store.get('attempt')); h.hooks.cleanup();
  }
});

test('a refunded saved order is explained and unlocked, not reported as a new successful purchase', async () => {
  const store = new Map([['attempt', { key: 'old-key', body: { event_id: 'event-1', ticket_type_id: 'paid', quantity: 1, attendee_name: 'Attendee' } }]]);
  const h = checkoutHarness({ store, api: { quoteOrder: async () => quoteFixture,
    checkoutOrder: async () => ({ order: { id: 'old-order', status: 'refunded' }, tickets: [{ id: 'old-ticket' }] }) } });
  await h.settle(); await h.view.purchase(); await h.settle();
  assert.equal(h.view.confirmation, null); assert.equal(h.view.attempt, null);
  assert.match(h.view.error, /saved order is refunded/); h.hooks.cleanup();
});

test('leaving during preflight cannot submit from an abandoned screen or race another checkout screen', async () => {
  let finishQuote, preflight = false, purchases = 0;
  const store = new Map(), locks = new Set();
  const first = checkoutHarness({ store, locks, api: {
    quoteOrder: async () => preflight ? new Promise((resolve) => { finishQuote = resolve; }) : quoteFixture,
    checkoutOrder: async () => { purchases++; return {}; },
  } });
  await first.settle(); preflight = true;
  const request = first.view.purchase(); await first.hooks.flush();
  first.hooks.cleanup();
  const second = checkoutHarness({ store, locks }); await second.settle(); await second.view.purchase();
  assert.equal(purchases, 0); assert.equal(second.calls.filter((c) => c.method === 'checkoutOrder').length, 0);
  finishQuote(quoteFixture); await request;
  assert.equal(store.size, 0); assert.equal(locks.size, 0); second.hooks.cleanup();
});

test('actual purchase storage isolates account/event recovery records and coordinates screen locks', async () => {
  const storage = new Map();
  const attempts = load('src/auth/PurchaseAttempt.ts', { 'expo-secure-store': {
    getItemAsync: async (key) => storage.get(key) ?? null,
    setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async (key) => storage.delete(key),
  } });
  const value = { key: 'saved-key', body: { event_id: 'event-1', ticket_type_id: 'paid', quantity: 1, attendee_name: 'Attendee' } };
  await attempts.savePurchaseAttempt('buyer-1', value);
  assert.equal((await attempts.readPurchaseAttempt('buyer-1', 'event-1')).key, 'saved-key');
  assert.equal(await attempts.readPurchaseAttempt('buyer-2', 'event-1'), null);
  assert.equal(await attempts.readPurchaseAttempt('buyer-1', 'event-2'), null);
  const release = attempts.acquirePurchaseLock('buyer-1', 'event-1');
  assert.equal(attempts.acquirePurchaseLock('buyer-1', 'event-1'), null);
  release(); const again = attempts.acquirePurchaseLock('buyer-1', 'event-1'); assert.equal(typeof again, 'function'); again();
  await attempts.clearPurchaseAttempt('buyer-1', 'event-1'); assert.equal(storage.size, 0);
});
