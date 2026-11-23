const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./runtime.cjs');

const plain = (value) => JSON.parse(JSON.stringify(value));

test('profile and activation requests match the backend routes', async () => {
  const calls = [];
  const client = { apiRequest: async (path, options) => { calls.push({ path, options: plain(options ?? {}) }); return {}; } };
  const api = load('src/api/organizer.ts', { './client': client, '../config/environment': { environment: { apiBaseUrl: '' } } });
  await api.getOrganizerProfile('tok');
  await api.updateOrganizerProfile('tok', { contact_phone: '+77011234567', payout_account_details: 'KZ12' });
  await api.verifyOrganizerProfile('tok');
  await api.getActivationChecklist('tok', 'event/1');
  await api.activatePaidSales('tok', 'event/1');
  assert.deepEqual(calls.map((c) => [c.options.method ?? 'GET', c.path]), [
    ['GET', '/api/organizer/profile'],
    ['PUT', '/api/organizer/profile'],
    ['POST', '/api/organizer/profile/verify'],
    ['GET', '/api/events/event%2F1/activation-checklist'],
    ['POST', '/api/events/event%2F1/activate-paid'],
  ]);
  for (const { options } of calls) assert.equal(options.token, 'tok');
  assert.deepEqual(calls[1].options.body, { contact_phone: '+77011234567', payout_account_details: 'KZ12' });
  // The backend refuses activation unless the terms flag is sent.
  assert.deepEqual(calls[4].options.body, { accept_terms: true });
});

test('the profile form needs a real phone and a payout account', () => {
  const { profileInput } = load('src/utils/organizerSetup.ts');
  assert.deepEqual(plain(profileInput('  +7 701 123 45 67 ', ' KZ86 125K ')),
    { input: { contact_phone: '+7 701 123 45 67', payout_account_details: 'KZ86 125K' } });
  for (const [phone, payout] of [['', 'KZ1'], ['123', 'KZ1'], ['call me', 'KZ1'], ['+7 701 123 45 67', '  '], ['+7'.padEnd(41, '1'), 'KZ1'], ['+77011234567', 'K'.repeat(201)]]) {
    assert.equal(typeof profileInput(phone, payout).error, 'string', `${phone} / ${payout}`);
  }
});

test('verification is offered only for saved, complete, unverified profiles', () => {
  const { canVerify } = load('src/utils/organizerSetup.ts');
  assert.equal(canVerify({ contact_phone: '+77011234567', payout_account_details: 'KZ1', paid_sales_verified: false }), true);
  assert.equal(canVerify({ contact_phone: '+77011234567', payout_account_details: 'KZ1', paid_sales_verified: true }), false);
  assert.equal(canVerify({ contact_phone: null, payout_account_details: 'KZ1', paid_sales_verified: false }), false);
  assert.equal(canVerify({ contact_phone: '+77011234567', payout_account_details: ' ', paid_sales_verified: false }), false);
});

test('activation is offered only when the backend would accept it', () => {
  const { activationState, isProfileStep } = load('src/utils/organizerSetup.ts');
  const items = (done) => ['paid_ticket_type', 'identity_verified', 'payout_account', 'fee_paid', 'terms_accepted']
    .map((key) => ({ key, label: key, done: done.includes(key) }));
  const base = { paid_sales_active: false, suspended_by_admin: false };
  assert.equal(activationState({ ...base, items: items(['paid_ticket_type', 'identity_verified', 'payout_account']) }).kind, 'ready');
  const blocked = activationState({ ...base, items: items(['paid_ticket_type', 'payout_account']) });
  assert.deepEqual(plain(blocked), { kind: 'blocked', missing: ['identity_verified'] });
  assert.equal(activationState({ ...base, items: items(['identity_verified', 'payout_account']) }).kind, 'no_paid_tickets');
  assert.equal(activationState({ ...base, paid_sales_active: true, items: items([]) }).kind, 'active');
  assert.equal(activationState({ ...base, suspended_by_admin: true, items: items(['paid_ticket_type', 'identity_verified', 'payout_account']) }).kind, 'suspended');
  assert.deepEqual(['identity_verified', 'payout_account', 'paid_ticket_type', 'fee_paid'].map(isProfileStep), [true, true, false, false]);
});
