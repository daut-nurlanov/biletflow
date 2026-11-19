const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime, native, nodes } = require('./runtime.cjs');
const { checkoutHarness, quoteFixture } = require('./checkout-runtime.cjs');

// Synthetic codes belong only to this test fixture, not the demo database.
function promotionHarness(overrides = {}) {
  const h = checkoutHarness({ api: {
    quoteOrder: async (_, input) => {
      if (input.promo_code && input.promo_code !== 'TEST20') throw new h.ApiError('Invalid promo code', 404);
      const discount = input.promo_code ? 200 : 0;
      return { ...quoteFixture, promo_code: input.promo_code ?? null, discount,
        total: 1000 - discount, processing_fee: (1000 - discount) * .03 };
    },
    checkoutOrder: async (_, input) => ({ order: { id: 'confirmed', status: 'paid',
      total_amount: input.promo_code ? 800 : 1000 }, tickets: [{ id: 'ticket-1' }] }),
    ...overrides,
  } });
  return h;
}

function checkoutForm(h) {
  const ui = runtime();
  const { CheckoutScreen } = load('src/screens/CheckoutScreen.tsx', {
    react: { ...ui.react, useCallback: (fn) => fn },
    'react-native': { ...native, ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Keyboard: { dismiss() {} } },
    '../api/events': {}, '../auth/SessionContext': { useSession: () => ({ state: { status: 'signedIn', user: { id: 'buyer-1' } } }) },
    '../components/AppButton': { AppButton: 'AppButton' }, '../components/ErrorState': { ErrorState: 'ErrorState' },
    '../components/LoadingState': { LoadingState: 'LoadingState' }, '../components/Screen': { Screen: 'Screen' },
    '../hooks/useApiResource': { useApiResource: () => ({ data: h.event }) },
    '../hooks/useCheckout': { useCheckout: () => h.view },
    '../theme': { sharedStyles: {} }, '../theme/forms': { formStyles: {} },
    '../utils/formatting': { formatMoney: String, formatPrice: String },
  });
  const form = CheckoutScreen({ route: { params: { eventId: h.event.id } }, navigation: { navigate() {} } });
  return () => nodes(ui.render(form.type, form.props));
}

test('clearing the visible checkout promo field removes the rejected code without another Apply tap', async () => {
  const h = promotionHarness(); await h.settle();
  const renderForm = checkoutForm(h);
  const field = () => renderForm().find((node) => node.props?.accessibilityLabel === 'Promo code or campaign link');
  field().props.onChangeText('INVALID');
  h.render();
  renderForm().find((node) => node.props?.title === 'Apply promotion').props.onPress();
  await h.settle(); assert.equal(h.view.canBuy, false);
  field().props.onChangeText('');
  await h.settle();
  for (const [callback, delay] of [...h.timers]) if (delay === 350) { h.timers.delete(callback); callback(); }
  await h.settle();
  assert.equal(h.view.form.promo, '');
  assert.equal(h.view.canBuy, true);
  h.hooks.cleanup();
});

test('reapplying the same code after a transient quote failure retries the quote', async () => {
  let fail = true;
  const h = promotionHarness({ quoteOrder: async (_, input) => {
    if (input.promo_code && fail) throw new Error('Network unavailable');
    return { ...quoteFixture, promo_code: input.promo_code ?? null };
  } });
  await h.settle(); await h.view.applyPromo('TEST20'); await h.settle();
  assert.equal(h.view.canBuy, false);
  fail = false; await h.view.applyPromo('TEST20'); await h.settle();
  assert.equal(h.view.quotes.error, null); assert.equal(h.view.canBuy, true);
  h.hooks.cleanup();
});

async function edit(h, text) {
  h.view.changePromo(text);
  h.render();
  assert.equal(h.view.canBuy, false, 'editing invalidates the previous quote immediately');
  await h.hooks.flush();
  for (const [callback, delay] of [...h.timers]) if (delay === 350) {
    h.timers.delete(callback); callback();
  }
  await h.settle();
}

async function buy(h, expectedTotal) {
  assert.equal(h.view.canBuy, true);
  await h.view.purchase(); await h.settle();
  assert.equal(h.view.confirmation.order.total_amount, expectedTotal);
  assert.equal(h.calls.filter((c) => c.method === 'checkoutOrder').length, 1);
  h.hooks.cleanup();
}

test('invalid promo → remove in the input → fresh full-price quote and successful checkout', async () => {
  const h = promotionHarness(); await h.settle();
  await h.view.applyPromo('INVALID'); await h.settle();
  assert.equal(h.view.canBuy, false);
  assert.match(h.view.promoError, /Invalid promo code.*correct.*remove/i);
  await h.view.purchase(); assert.equal(h.store.size, 0);
  await edit(h, '');
  assert.equal(h.view.form.promo, ''); assert.equal(h.view.promoError, null);
  assert.equal(h.view.reviewed.value.promo_code, null);
  await buy(h, 1000);
});

test('invalid promo → corrected input → freshly confirmed discounted checkout', async () => {
  const h = promotionHarness(); await h.settle();
  await edit(h, 'INVALID'); assert.equal(h.view.canBuy, false);
  await edit(h, ' test20 ');
  assert.equal(h.view.form.promo, 'TEST20'); assert.equal(h.view.reviewed.value.discount, 200);
  await buy(h, 800);
});

test('valid promo → invalid promo → same valid promo requires a new quote', async () => {
  const h = promotionHarness(); await h.settle();
  await edit(h, 'TEST20'); const first = h.view.reviewed;
  await edit(h, 'INVALID'); assert.equal(h.view.canBuy, false);
  assert.equal(h.view.reviewed, null);
  await edit(h, 'TEST20'); assert.notEqual(h.view.reviewed, first);
  await buy(h, 800);
});

test('quote network error → retry the same promo → successful checkout', async () => {
  let fail = false;
  const h = promotionHarness({ quoteOrder: async (_, input) => {
    if (fail) throw new Error('Network unavailable');
    return { ...quoteFixture, promo_code: input.promo_code ?? null,
      discount: input.promo_code ? 200 : 0, total: input.promo_code ? 800 : 1000,
      processing_fee: input.promo_code ? 24 : 30 };
  } });
  await h.settle(); fail = true;
  await edit(h, 'TEST20'); assert.match(h.view.quotes.error, /Network/);
  assert.equal(h.view.canBuy, false); assert.equal(h.view.promoError, null);
  fail = false;
  h.view.quotes.retry(); await h.settle();
  assert.equal(h.view.quotes.error, null);
  await buy(h, 800);
});

test('rapid promo edits ignore out-of-order failures and successful quotes, even when returning to the same code', async () => {
  const pending = [];
  let hold = false;
  const h = promotionHarness({ quoteOrder: async (_, input, signal) => {
    if (!hold) return { ...quoteFixture, promo_code: input.promo_code ?? null,
      discount: input.promo_code ? 200 : 0, total: input.promo_code ? 800 : 1000,
      processing_fee: input.promo_code ? 24 : 30 };
    return new Promise((resolve, reject) => pending.push({ input, signal, resolve, reject }));
  } });
  await h.settle(); hold = true;
  await edit(h, 'TEST20');
  await edit(h, 'INVALID');
  await edit(h, 'TEST20');
  assert.equal(pending.length, 3); assert.equal(h.view.canBuy, false);
  pending[2].resolve({ ...quoteFixture, promo_code: 'TEST20', discount: 200, total: 800, processing_fee: 24 });
  await h.settle(); assert.equal(h.view.canBuy, true);
  pending[1].reject(new h.ApiError('Invalid promo code', 404));
  pending[0].resolve({ ...quoteFixture, promo_code: 'TEST20', total: 999 });
  await h.settle(); assert.equal(h.view.reviewed.value.total, 800);
  assert.equal(h.view.quotes.error, null); assert.equal(h.view.promoError, null);
  hold = false;
  await buy(h, 800);
});

test('a purchase callback captured before a promo edit cannot submit an old quote', async () => {
  const h = promotionHarness(); await h.settle();
  const stalePurchase = h.view.purchase;
  h.view.changePromo('INVALID');
  await stalePurchase();
  assert.equal(h.calls.filter((c) => c.method === 'checkoutOrder').length, 0);
  assert.equal(h.store.size, 0); h.hooks.cleanup();
});

test('Remove promotion stays available during campaign resolution and late responses cannot restore it', async () => {
  let resolveCampaign;
  const h = checkoutHarness({ promotions: { campaignTokenFromInput: (input) => input.startsWith('cmp_') ? input : null,
    resolveCampaign: () => new Promise((resolve) => { resolveCampaign = resolve; }) } });
  await h.settle();
  const pending = h.view.applyPromo('cmp_test'); await h.settle();
  assert.equal(h.view.applying, true); assert.equal(h.view.canBuy, false);
  const renderForm = checkoutForm(h);
  const input = renderForm().find((node) => node.props?.accessibilityLabel === 'Promo code or campaign link');
  assert.equal(input.props.editable, true);
  const remove = renderForm().find((node) => node.props?.title === 'Remove promotion');
  assert.equal(remove.props.disabled, false); remove.props.onPress(); await h.settle();
  assert.equal(h.view.canBuy, true); assert.equal(h.view.form.promo, '');
  resolveCampaign({ event_id: h.event.id, promo_code: 'LATE' }); await pending; await h.settle();
  assert.equal(h.view.form.promo, ''); assert.equal(h.view.applying, false);
  await buy(h, 1000);
});

test('failed campaign resolution blocks the old full-price quote until corrected or removed', async () => {
  const h = checkoutHarness({ promotions: { campaignTokenFromInput: (input) => input || null,
    resolveCampaign: async () => { throw new Error('Campaign expired'); } } });
  await h.settle(); await h.view.applyPromo('cmp_expired'); await h.settle();
  assert.match(h.view.promoError, /Campaign expired/); assert.equal(h.view.canBuy, false);
  await h.view.purchase(); assert.equal(h.store.size, 0);
  await h.view.applyPromo(''); await h.settle(); await buy(h, 1000);
});

test('a final preflight promo rejection never persists or submits a purchase, and removal recovers', async () => {
  let expired = false;
  const h = promotionHarness({ quoteOrder: async (_, input) => {
    if (expired && input.promo_code) throw new h.ApiError('This promo code has been disabled', 409);
    return { ...quoteFixture, promo_code: input.promo_code ?? null };
  } });
  await h.settle(); await h.view.applyPromo('TEST20'); await h.settle();
  expired = true; await h.view.purchase(); await h.settle();
  assert.equal(h.view.canBuy, false); assert.equal(h.store.size, 0);
  assert.equal(h.calls.filter((c) => c.method === 'checkoutOrder').length, 0);
  assert.match(h.view.promoError, /disabled/);
  await h.view.applyPromo(''); await h.settle(); await buy(h, 1000);
});

test('a queued debounce callback cannot overwrite a newer explicit promotion', async () => {
  const h = promotionHarness(); await h.settle();
  h.view.changePromo('INVALID'); await h.settle();
  const queued = [...h.timers].find(([, delay]) => delay === 350)[0];
  await h.view.applyPromo('TEST20'); await h.settle();
  queued(); await h.settle();
  assert.equal(h.view.form.promo, 'TEST20'); assert.equal(h.view.promoError, null);
  await buy(h, 800);
});

test('promo edits and refresh actions cannot change a submitted recoverable attempt', async () => {
  let rejectPurchase;
  const h = promotionHarness({ checkoutOrder: async () => new Promise((_, reject) => { rejectPurchase = reject; }) });
  await h.settle(); await h.view.applyPromo('TEST20'); await h.settle();
  const request = h.view.purchase(); await h.hooks.flush();
  h.view.changePromo('INVALID'); await h.view.applyPromo(''); h.view.quotes.retry();
  await h.settle();
  assert.equal(h.view.form.promo, 'TEST20');
  const saved = h.store.get('attempt'); assert.equal(saved.body.promo_code, 'TEST20');
  rejectPurchase(new Error('Response lost')); await request; await h.settle();
  assert.equal(h.store.get('attempt'), saved); assert.equal(h.view.canBuy, true);
  h.view.changePromo('INVALID'); await h.settle(); assert.equal(h.view.form.promo, 'TEST20');
  h.hooks.cleanup();
});
