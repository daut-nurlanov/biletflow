const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, native, nodes, runtime, theme } = require('./runtime.cjs');

test('history and staff calls use scoped authenticated routes and assign-only mode', async () => {
  const calls = [];
  const client = { './client': { apiRequest: async (...args) => { calls.push(args); } } };
  const events = load('src/api/events.ts', client);
  const staff = load('src/api/staff.ts', client);
  const signal = new AbortController().signal;
  await events.getEventActivity('organizer', 'event/id', signal);
  await staff.getEventStaff('organizer', 'event/id', signal);
  await staff.assignExistingStaff('organizer', 'event/id', 'door@example.test');
  await staff.revokeEventStaff('organizer', 'event/id', 'staff/id');
  assert.deepEqual(calls.map(([path]) => path), [
    '/api/events/event%2Fid/timeline?limit=50', '/api/events/event%2Fid/staff',
    '/api/events/event%2Fid/staff', '/api/events/event%2Fid/staff/staff%2Fid',
  ]);
  assert.ok(calls.every(([, options]) => options.token === 'organizer'));
  assert.ok(calls.slice(0, 2).every(([, options]) => options.signal === signal));
  assert.equal(calls[2][1].body.mode, 'assign');
  assert.equal(calls[2][1].body.email, 'door@example.test');
  assert.equal(calls[3][1].method, 'DELETE');
});

test('organizer display phase recognizes events that ended and retains explicit restrictions', () => {
  const { eventDisplayStatus } = load('src/utils/eventTiming.ts');
  const now = new Date('2026-11-19T15:00:00Z');
  const ended = { start_time: '2026-11-19T12:00:00Z', end_time: null };
  assert.equal(eventDisplayStatus({ ...ended, status: 'upcoming' }, now), 'completed');
  assert.equal(eventDisplayStatus({ ...ended, status: 'upcoming', end_time: '2026-11-19T16:00:00Z' }, now), 'active');
  assert.equal(eventDisplayStatus({ ...ended, status: 'upcoming', start_time: '2026-11-20T10:00:00Z' }, now), 'upcoming');
  for (const status of ['draft', 'suspended', 'cancelled', 'completed']) {
    assert.equal(eventDisplayStatus({ ...ended, status }, now), status);
  }
});

test('staff assignment validates input and locks duplicate actions; removal confirms and refreshes', async () => {
  const hooks = runtime();
  const calls = [];
  const item = { id: 'staff', full_name: 'Door Staff', email: 'door@example.test', status: 'active' };
  let pending, confirmation;
  let refreshes = 0;
  const data = { data: [item], loading: false, refreshing: false, error: null, refresh: () => { refreshes++; } };
  const { EventStaffScreen } = load('src/screens/EventStaffScreen.tsx', {
    react: hooks.react,
    'react-native': { ...native, Keyboard: { dismiss() {} }, Alert: { alert: (...args) => { confirmation = args; } } },
    '../api/staff': {
      assignExistingStaff: (...args) => { calls.push(args); return new Promise((resolve) => { pending = resolve; }); },
      revokeEventStaff: async (...args) => { calls.push(args); },
    },
    '../auth/SessionContext': { useSession: () => ({ authed: (fn) => fn('organizer') }) },
    '../hooks/useApiResource': { useApiResource: () => data },
    '../theme': { theme, sharedStyles: {} }, '../theme/forms': { formStyles: {} },
    ...Object.fromEntries(['AppButton', 'EmptyState', 'ErrorState', 'LoadingState', 'Screen']
      .map((name) => ['../components/' + name, { [name]: name }])),
  });
  const render = () => nodes(hooks.render(EventStaffScreen, { route: { params: { eventId: 'event', eventTitle: 'Event' } } }));
  const button = (tree, label) => tree.find((node) => node.type === 'AppButton' && node.props.title === label);
  button(render(), 'Assign door staff').props.onPress();
  assert.equal(calls.length, 0);
  assert.ok(render().some((node) => node.props.children === 'Enter a valid door staff email address.'));
  render().find((node) => node.type === 'TextInput').props.onChangeText(' DOOR@example.test ');
  const assign = button(render(), 'Assign door staff').props.onPress;
  assign(); assign();
  assert.deepEqual(calls, [['organizer', 'event', 'door@example.test']]);
  pending({ already_assigned: false }); await hooks.flush();
  const list = render().find((node) => node.type === 'FlatList');
  button(nodes(list.props.renderItem({ item })), 'Remove access for Door Staff').props.onPress();
  assert.equal(calls.length, 1);
  confirmation[2].find((action) => action.text === 'Remove access').onPress();
  await hooks.flush();
  assert.deepEqual(calls[1], ['organizer', 'event', 'staff']);
  assert.equal(refreshes, 2);
  assert.equal(button(nodes(list.props.renderItem({ item: { ...item, status: 'revoked' } })), 'Remove access for Door Staff'), undefined);
  data.error = 'Access denied';
  assert.ok(render().some((node) => node.type === 'ErrorState'));
  assert.equal(button(render(), 'Assign door staff'), undefined);
});
