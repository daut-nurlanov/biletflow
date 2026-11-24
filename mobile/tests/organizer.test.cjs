const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./runtime.cjs');

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const clientMock = (calls, answer = []) => ({
  ApiError,
  apiRequest: async (path, options) => { calls.push({ path, options }); return answer; },
});
const environment = { environment: { apiBaseUrl: 'http://10.0.0.5:8000' } };

test('organizer requests match the backend routes and always send the token', async () => {
  const calls = [];
  const api = load('src/api/organizer.ts', { './client': clientMock(calls), '../config/environment': environment });
  const signal = new AbortController().signal;
  await api.getEventAttendees('tok', 'event/1', { q: '  Dana  ', status: 'checked_in' }, signal);
  await api.getEventAttendees('tok', 'event/1', { q: '', status: '' }, signal);
  await api.getEventOrders('tok', 'event/1', 'refunded', signal);
  await api.getEventOrders('tok', 'event/1', undefined, signal);
  await api.getOrderDetail('tok', 'order 1', signal);
  await api.refundOrder('tok', 'order-1', 'Cannot come');
  await api.cancelRegistration('tok', 'order-2');
  await api.getPromoCampaigns('tok', 'event/1', signal);
  await api.createPromoCampaign('tok', 'event/1', { discount_type: 'percentage', discount_value: 20, max_redemptions: 5 });
  await api.setPromoCampaignActive('tok', 'cmp-1', false);
  await api.setPromoCampaignActive('tok', 'cmp-1', true);
  assert.deepEqual(calls.map((c) => c.path), [
    '/api/events/event%2F1/attendees?q=Dana&status=checked_in',
    '/api/events/event%2F1/attendees',
    '/api/events/event%2F1/orders?status=refunded',
    '/api/events/event%2F1/orders',
    '/api/orders/order%201',
    '/api/orders/order-1/refund',
    '/api/orders/order-2/cancel',
    '/api/events/event%2F1/promo-campaigns',
    '/api/events/event%2F1/promo-campaigns',
    '/api/promo-campaigns/cmp-1/disable',
    '/api/promo-campaigns/cmp-1/enable',
  ]);
  for (const { options } of calls) assert.equal(options.token, 'tok');
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(calls[5].options), { method: 'POST', token: 'tok', body: { reason: 'Cannot come' } });
  assert.equal(calls[6].options.method, 'POST');
  assert.equal(calls[6].options.body, undefined);
  assert.deepEqual(plain(calls[8].options.body), { discount_type: 'percentage', discount_value: 20, max_redemptions: 5 });
  const qr = api.promoQrImageSource('tok', 'cmp 1');
  assert.equal(qr.uri, 'http://10.0.0.5:8000/api/promo-campaigns/cmp%201/qr.png');
  assert.deepEqual({ ...qr.headers }, { Authorization: 'Bearer tok' });
});

test('refund or cancel follows the backend rules', () => {
  const { orderAction } = load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } });
  const valid = [{ status: 'valid' }, { status: 'valid' }];
  assert.equal(orderAction({ status: 'paid', total_amount: '10000.00', tickets: valid }).kind, 'refund');
  assert.equal(orderAction({ status: 'paid', total_amount: '0.00', tickets: valid }).kind, 'cancel');
  assert.equal(orderAction({ status: 'paid', total_amount: 0, tickets: valid }).kind, 'cancel');
  const used = orderAction({ status: 'paid', total_amount: 5000, tickets: [{ status: 'valid' }, { status: 'checked_in' }] });
  assert.equal(used.kind, 'none');
  assert.match(used.reason, /already used/);
  assert.equal(orderAction({ status: 'paid', total_amount: 5000, tickets: [] }).kind, 'none');
  for (const status of ['refunded', 'cancelled', 'failed', 'pending']) {
    assert.deepEqual({ ...orderAction({ status, total_amount: 5000, tickets: valid }) }, { kind: 'none', reason: null }, status);
  }
});

test('backend refusals read the same as on the website', () => {
  const { organizerMessage } = load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } });
  assert.equal(organizerMessage(new ApiError('Some tickets were already used at the door, so the order cannot be refunded', 409)),
    'Tickets in this order have already been used. A refund is not available.');
  assert.equal(organizerMessage(new ApiError('This order is already refunded', 409)), 'This order is already refunded');
  assert.match(organizerMessage(new ApiError('x', 401)), /session has expired/);
  assert.match(organizerMessage(new ApiError('x', 403)), /access/);
  assert.equal(organizerMessage(new Error('No Wi-Fi.')), 'No Wi-Fi.');
});

test('seat, discount and usage labels', () => {
  const u = load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } });
  assert.equal(u.seatLabel({ section: 'Balcony', row_label: 'B', seat_number: '12' }), 'Balcony-B12');
  assert.equal(u.seatLabel({ section: null, row_label: null, seat_number: null }), null);
  assert.equal(u.discountLabel({ discount_type: 'percentage', discount_value: '20.00' }), '20% off');
  assert.match(u.discountLabel({ discount_type: 'fixed', discount_value: 1000 }), /^1.?000 KZT off$/);
  assert.equal(u.usageLabel({ redemptions_count: 3, max_redemptions: 50 }), '3 of 50 used · 47 left');
  assert.equal(u.usageLabel({ redemptions_count: null, max_redemptions: 5 }), '0 of 5 used · 5 left');
  assert.equal(u.usageLabel({ redemptions_count: 5, max_redemptions: 5 }), '5 of 5 used · none left');
});

test('the campaign form is checked with the backend rules before sending', () => {
  const { campaignInput } = load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } });
  const form = { code: ' demo20 ', discountType: 'percentage', discountValue: '20', maxRedemptions: '50' };
  assert.deepEqual(JSON.parse(JSON.stringify(campaignInput(form))),
    { input: { code: 'DEMO20', discount_type: 'percentage', discount_value: 20, max_redemptions: 50 } });
  const generated = campaignInput({ ...form, code: '  ' });
  assert.equal('code' in generated.input, false);
  assert.equal(campaignInput({ ...form, discountType: 'fixed', discountValue: '1500,5' }).input.discount_value, 1500.5);
  const errors = [
    { ...form, code: 'has space' },
    { ...form, code: 'X'.repeat(41) },
    { ...form, discountValue: '' },
    { ...form, discountValue: '0' },
    { ...form, discountValue: 'abc' },
    { ...form, discountValue: '101' },
    { ...form, maxRedemptions: '0' },
    { ...form, maxRedemptions: '2.5' },
  ];
  for (const bad of errors) assert.equal(typeof campaignInput(bad).error, 'string', JSON.stringify(bad));
  assert.equal(typeof campaignInput({ ...form, discountType: 'fixed', discountValue: '5000' }).input, 'object');
});

test('campaign discount precision and bounds match stored discounts', () => {
  const { campaignInput } = load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } });
  const form = { code: '', maxRedemptions: '1' };
  for (const [discountType, discountValue, expected] of [
    ['fixed', '0.01', 0.01], ['fixed', '1500,50', 1500.5],
    ['fixed', '99999999.99', 99999999.99], ['percentage', '100.00', 100],
    ['percentage', '99.99', 99.99], ['percentage', '0.01', 0.01],
  ]) {
    assert.equal(campaignInput({ ...form, discountType, discountValue }).input.discount_value, expected);
  }
  for (const [discountType, discountValue] of [
    ['fixed', '0'], ['fixed', '-0.01'], ['fixed', '0.001'], ['fixed', '1.234'],
    ['fixed', '1.23000000000000000001'], ['fixed', '100000000'],
    ['percentage', '100.01'], ['percentage', '12.345'], ['percentage', '0'],
  ]) {
    assert.equal(typeof campaignInput({ ...form, discountType, discountValue }).error, 'string', discountValue);
  }
});
