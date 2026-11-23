const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime } = require('./runtime.cjs');

const setup = load('src/utils/organizerSetup.ts');
const type = {
  id: 'type', name: 'Standard', price: 1500.5, is_hidden: false,
  total_quantity: 15, quantity_available: 3, max_per_order: 4,
  description: null, sales_start_time: '2026-11-25T15:00:00Z', sales_end_time: '2026-12-05T15:00:00Z',
};
const event = {
  id: 'event', organizer_id: 'owner', title: 'Concert', venue_name: 'City Hall', capacity: 20,
  start_time: '2026-12-10T13:00:42Z', end_time: '2026-12-10T16:00:00Z',
  registration_opens_at: null, registration_closes_at: null, visibility: 'public', ticket_types: [type],
};

test('draft creation validates real local dates and sends Almaty timestamps', () => {
  const draft = { ...setup.eventDraft(), title: ' Concert ', venue_name: 'City Hall', start_time: '2026-12-10 18:00' };
  const body = setup.eventInput(draft);
  assert.equal(body.title, 'Concert');
  assert.equal(body.start_time, '2026-12-10T18:00:00+05:00');
  assert.equal(body.visibility, 'public');
  assert.equal(body.end_time, undefined);
  assert.throws(() => setup.eventInput({ ...draft, start_time: '2026-02-30 18:00' }), /valid date/);
  assert.throws(() => setup.eventInput({ ...draft, end_time: '2026-12-10 17:30' }), /end after/);
  assert.throws(() => setup.eventInput({ ...draft, capacity: '1.5' }), /whole number/);
  assert.throws(() => setup.eventInput({
    ...draft, registration_opens_at: '2026-12-10 12:00', registration_closes_at: '2026-12-09 18:00',
  }), /close after/);
});

test('editing preserves unchanged timestamps and omitted fields while checking configured capacity', () => {
  const draft = setup.eventDraft(event);
  assert.equal(draft.start_time, '2026-12-10 18:00');
  const body = setup.eventInput({ ...draft, title: 'Updated', end_time: '' }, event);
  assert.equal(body.start_time, event.start_time);
  assert.equal(body.end_time, event.end_time);
  assert.deepEqual({ ...setup.changedSetupFields(body, event) }, { title: 'Updated' });
  assert.throws(() => setup.eventInput({ ...draft, capacity: '14' }, event), /offer 15 tickets/);
  assert.throws(() => setup.eventInput({ ...draft, start_time: '2026-12-11 18:00', end_time: '' }, event), /end after/);
});

test('ticket form enforces price, capacity, sold floor, per-order limit and sale windows', () => {
  const draft = setup.ticketTypeDraft(event, type);
  const body = setup.ticketTypeInput({ ...draft, price: '2500,75', total_quantity: '16', is_hidden: true }, event, type);
  assert.deepEqual({ ...setup.changedSetupFields(body, type) }, { price: 2500.75, total_quantity: 16, is_hidden: true });
  assert.throws(() => setup.ticketTypeInput({ ...draft, price: '0.001' }, event, type), /two decimal places/);
  assert.throws(() => setup.ticketTypeInput({ ...draft, total_quantity: '11' }, event, type), /12 tickets are already sold/);
  assert.throws(() => setup.ticketTypeInput({ ...draft, total_quantity: '21' }, event, type), /capacity is 20/);
  assert.throws(() => setup.ticketTypeInput({ ...draft, max_per_order: '0' }, event, type), /Maximum per order/);
  assert.throws(() => setup.ticketTypeInput({ ...draft, sales_start_time: '', sales_end_time: '2026-11-24 20:00' }, event, type), /end after/);
  assert.equal(setup.ticketTypeDraft(event).total_quantity, '5');
});

test('lifecycle actions follow organizer phase and never offer changes for cancelled or completed events', () => {
  for (const phase of ['cancelled', 'completed']) {
    assert.equal(setup.canEditSetup(phase), false);
    assert.deepEqual([...setup.lifecycleActions(phase)], []);
  }
  assert.equal(setup.canEditSetup('suspended'), false);
  assert.deepEqual([...setup.lifecycleActions('suspended')], ['cancel']);
  assert.deepEqual([...setup.lifecycleActions('draft')], ['publish', 'cancel']);
  assert.deepEqual([...setup.lifecycleActions('upcoming')], ['unpublish', 'cancel']);
  assert.deepEqual([...setup.lifecycleActions('active')], ['unpublish', 'cancel']);
});

test('organizer mutations use the bearer session and documented endpoints', async () => {
  const calls = [];
  const api = load('src/api/organizerSetup.ts', { './client': { apiRequest: async (...args) => calls.push(args) } });
  await api.createEvent('token', { title: 'Draft' });
  await api.updateEvent('token', 'event/id', { capacity: 40 });
  await api.createTicketType('token', 'event/id', { name: 'Standard', price: 0 });
  await api.updateTicketType('token', 'type/id', { total_quantity: 8 });
  for (const action of ['publish', 'unpublish', 'cancel']) await api.changeEventStatus('token', 'event/id', action);
  assert.deepEqual(calls.map(([path, options]) => [path, options.method, options.token]), [
    ['/api/events', 'POST', 'token'], ['/api/events/event%2Fid', 'PUT', 'token'],
    ['/api/events/event%2Fid/ticket-types', 'POST', 'token'], ['/api/ticket-types/type%2Fid', 'PUT', 'token'],
    ['/api/events/event%2Fid/publish', 'POST', 'token'], ['/api/events/event%2Fid/unpublish', 'POST', 'token'],
    ['/api/events/event%2Fid/cancel', 'POST', 'token'],
  ]);
  assert.equal(calls[4][1].body, undefined);
});

test('management resource refuses another organizer’s public event and avoids fetching for other roles', async () => {
  const hooks = runtime();
  let loader;
  let reads = 0;
  const session = {
    state: { status: 'signedIn', user: { id: 'other', role: 'organizer' } },
    authed: (fn) => fn('token'),
  };
  const { useManagedEvent } = load('src/hooks/useOrganizerSetup.ts', {
    react: hooks.react, 'react-native': {}, '@react-navigation/native': {}, '../api/client': {},
    '../api/events': { getEvent: async () => { reads++; return event; } },
    '../auth/SessionContext': { useSession: () => session },
    './useApiResource': { useApiResource: (loadEvent) => { loader = loadEvent; return { data: event }; } },
  });
  const render = () => hooks.render(() => useManagedEvent('event'));
  const signal = new AbortController().signal;
  assert.equal(render().data, null);
  await assert.rejects(loader(signal), /do not manage/);
  session.state.user = { id: 'owner', role: 'organizer' };
  assert.equal(render().data, event);
  assert.equal(await loader(signal), event);
  session.state.user = { id: 'attendee', role: 'attendee' };
  render();
  await assert.rejects(loader(signal), /Sign in as an organizer/);
  assert.equal(reads, 2);
});

test('a pending save locks duplicate taps, and uncertain network failures say how to verify', async () => {
  const hooks = runtime();
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  const { useOrganizerSave } = load('src/hooks/useOrganizerSetup.ts', {
    react: hooks.react, 'react-native': { Keyboard: { dismiss() {} } },
    '@react-navigation/native': { usePreventRemove() {} }, '../api/client': { ApiError },
    '../api/events': {}, './useApiResource': {},
    '../auth/SessionContext': { useSession: () => ({ authed: (fn) => fn('token') }) },
  });
  let resolve;
  let writes = 0;
  const render = () => hooks.render(() => useOrganizerSave());
  const pending = render().save(() => {
    writes++;
    return new Promise((done) => { resolve = done; });
  }, 'Check Event setup.');
  assert.equal(render().busy, true);
  await render().save(() => { writes++; }, 'Check Event setup.');
  assert.equal(writes, 1);
  resolve({ id: 'event' });
  assert.equal((await pending).id, 'event');
  assert.equal(render().busy, false);
  await render().save(async () => { throw new Error('Connection interrupted.'); }, 'Check Event setup.');
  assert.equal(render().error, 'Connection interrupted. Check Event setup.');
  await render().save(async () => { throw new ApiError('Tickets have been sold.', 409); }, 'Check Event setup.');
  assert.equal(render().error, 'Tickets have been sold.');
});
