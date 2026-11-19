const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime, nodes, native, theme } = require('./runtime.cjs');

test('organizer money summaries show zero as KZT while zero-price tickets remain Free', () => {
  const { formatMoney, formatPrice } = load('src/utils/formatting.ts');
  assert.match(formatMoney('0.00'), /0/); assert.match(formatMoney('0.00'), /KZT/);
  assert.notEqual(formatMoney(0), 'Free'); assert.equal(formatPrice(0), 'Free');
  assert.equal(formatMoney(''), 'Amount unavailable');
});

test('event times and staff day grouping match the website across midnight and phone time zones', () => {
  const { getEventTiming } = load('src/utils/eventTiming.ts');
  const { formatDateTime } = load('src/utils/formatting.ts');
  const now = new Date('2026-11-16T20:00:00Z'); // November 17 in Almaty.
  assert.equal(getEventTiming({ start_time: '2026-11-17T01:00:00Z', end_time: null }, now), 'today');
  assert.equal(getEventTiming({ start_time: '2026-11-16T18:00:00Z', end_time: null }, now), 'past');
  assert.equal(getEventTiming({ start_time: '2026-11-16T18:00:00Z', end_time: '2026-11-17T03:00:00Z' }, now), 'today');
  assert.equal(getEventTiming({ start_time: '2026-11-18T01:00:00Z', end_time: null }, now), 'upcoming');
  assert.match(formatDateTime('2026-11-16T20:00:00Z'), /17.*Almaty time/);
  assert.equal(formatDateTime('bad-date'), 'Date unavailable');
});

test('event browsing, analytics and staff operations use current authenticated contracts', async () => {
  const calls = [];
  const client = { apiRequest: async (path, options) => { calls.push({ path, options }); return []; } };
  const events = load('src/api/events.ts', { './client': client });
  const staff = load('src/api/checkin.ts', { './client': client });
  const signal = new AbortController().signal;
  await events.getEvents(signal, 'session');
  await events.getEvent('event/1', signal, 'session');
  await events.getEventAnalytics('event/1', 'session', signal);
  await staff.searchTickets('session', 'event/1', '  Attendee  ', signal);
  await staff.verifyQr('session', 'admission-hash', 'event/1', signal);
  await staff.undoCheckin('session', 'ticket-1', signal);
  await staff.getAttendanceStats('session', 'event/1', signal);
  assert.deepEqual(calls.map((c) => c.path), ['/api/events?public=true', '/api/events/event%2F1',
    '/api/events/event%2F1/analytics', '/api/checkin/manual-search', '/api/checkin/verify-qr',
    '/api/checkin/undo', '/api/events/event%2F1/checkin-stats']);
  for (const { options } of calls) { assert.equal(options.token, 'session'); assert.equal(options.signal, signal); }
  assert.equal(calls[3].options.body.name, 'Attendee');
  assert.equal(calls[4].options.body.event_id, 'event/1');
  assert.equal(calls[5].options.body.ticket_id, 'ticket-1');
});

test('past staff events do not claim to be upcoming and retain explicit event restrictions', () => {
  const { StaffEventCard } = load('src/components/StaffEventCard.tsx', {
    'react-native': native, '../theme': { theme, sharedStyles: {} },
    '../utils/formatting': { formatDateTime: (date) => date },
    './StatusBadge': { StatusBadge: 'StatusBadge' },
  });
  const event = { title: 'Past meetup', venue_name: 'Hall', start_time: '2026-10-14T14:00:00Z' };
  for (const status of ['upcoming', 'active', 'cancelled', 'suspended', 'completed', 'draft']) {
    const tree = StaffEventCard({ event: { ...event, status }, timing: 'past', onPress() {} });
    const badge = nodes(tree).find((node) => node.type === 'StatusBadge');
    assert.equal(badge.props.status, ['upcoming', 'active'].includes(status) ? 'past' : status);
  }
  const upcoming = StaffEventCard({ event: { ...event, status: 'upcoming' }, timing: 'upcoming', onPress() {} });
  assert.equal(nodes(upcoming).find((node) => node.type === 'StatusBadge').props.status, 'upcoming');
});

test('SessionContext preserves sessions on revoked/event permissions but clears expired or suspended accounts', async () => {
  const hooks = runtime();
  const storage = new Map();
  const user = { id: 'attendee-1', full_name: 'Attendee', email: 'test@example.com', role: 'attendee' };
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const { SessionProvider, isSessionEnded } = load('src/auth/SessionContext.tsx', {
    react: hooks.react, '../api/client': { ApiError },
    'expo-secure-store': { getItemAsync: async (key) => storage.get(key),
      setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async (key) => storage.delete(key) },
    '../api/auth': { getMe: async () => user, login: async () => ({ ...user, token: 'session' }),
      registerAttendee: async () => ({ ...user, token: 'session' }) },
  });
  let value = () => hooks.render(SessionProvider).props.value;
  value(); await hooks.flush();
  await value().signIn('test@example.com', 'password123');
  for (const message of ['You are not assigned to this event', 'This event is suspended by BiletFlow', 'Paid sales were suspended']) {
    const error = new ApiError(message, 403);
    assert.equal(isSessionEnded(error), false);
    await assert.rejects(value().authed(async () => { throw error; }));
    assert.equal(value().state.status, 'signedIn');
  }
  assert.equal(isSessionEnded(new ApiError('This account has been suspended', 403)), true);
  await assert.rejects(value().authed(async () => { throw new ApiError('Expired', 401); }));
  assert.equal(value().state.status, 'signedOut');
  assert.equal(storage.size, 0);
  hooks.cleanup();
});

test('resources refresh on foreground, ignore cancelled stale results, poll only while active and clean up', async () => {
  const hooks = runtime();
  const listeners = new Set();
  const timers = new Map();
  const app = { currentState: 'active', addEventListener: (_, callback) => {
    listeners.add(callback); return { remove: () => listeners.delete(callback) };
  } };
  const emit = (state) => { app.currentState = state; for (const fn of listeners) fn(state); };
  const pending = [];
  const loader = (signal) => new Promise((resolve) => pending.push({ signal, resolve }));
  const { useApiResource } = load('src/hooks/useApiResource.ts', {
    react: hooks.react, '@react-navigation/native': { useFocusEffect: hooks.focus }, 'react-native': { AppState: app },
  }, { setInterval: (callback, ms) => { timers.set(ms, callback); return ms; }, clearInterval: (id) => timers.delete(id) });
  const render = () => hooks.render(() => useApiResource(loader, 15000));
  render(); await hooks.flush();
  assert.equal(pending.length, 1);
  timers.get(15000)(); assert.equal(pending.length, 1, 'poll must not replace an in-flight request');
  emit('background'); assert.equal(pending[0].signal.aborted, true);
  timers.get(15000)(); assert.equal(pending.length, 1);
  emit('active'); assert.equal(pending.length, 2);
  pending[0].resolve(['stale']); pending[1].resolve(['current']); await hooks.flush();
  assert.deepEqual(render().data, ['current']);
  timers.get(15000)(); assert.equal(pending.length, 3);
  hooks.cleanup();
  assert.equal(pending[2].signal.aborted, true);
  assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
});

test('saved sessions restore through auth/me and offline restoration preserves the cached account', async () => {
  const savedUser = { id: 'attendee-1', full_name: 'Saved Attendee', email: 'saved@example.com', role: 'attendee' };
  for (const offline of [false, true]) {
    const hooks = runtime();
    const storage = new Map([['biletflow.staff.token', 'saved-token'], ['biletflow.staff.user', JSON.stringify(savedUser)]]);
    const calls = [];
    const { SessionProvider } = load('src/auth/SessionContext.tsx', {
      react: hooks.react, '../api/client': { ApiError: class extends Error {} },
      'expo-secure-store': { getItemAsync: async (key) => storage.get(key),
        setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async (key) => storage.delete(key) },
      '../api/auth': { getMe: async (token) => { calls.push(token); if (offline) throw new Error('No connection'); return savedUser; } },
    });
    hooks.render(SessionProvider); await hooks.flush();
    const { state } = hooks.render(SessionProvider).props.value;
    assert.equal(state.status, 'signedIn'); assert.equal(state.token, 'saved-token');
    assert.equal(state.user.id, 'attendee-1'); assert.deepEqual(calls, ['saved-token']);
    hooks.cleanup();
  }
});

test('wrong-event and invalid scan responses never become admission success', () => {
  class ApiError extends Error {}
  const { outcomeFromResponse } = load('src/utils/scanOutcome.ts', { '../api/client': { ApiError } });
  for (const result of ['wrong_event', 'already_checked_in', 'cancelled', 'refunded', 'event_cancelled', 'event_suspended', 'unexpected']) {
    const outcome = outcomeFromResponse({ result });
    assert.notEqual(outcome.tone, 'success');
    assert.equal(outcome.autoDismiss, false);
    assert.equal(outcome.attendeeName, undefined);
  }
  assert.equal(outcomeFromResponse({ result: 'valid' }).tone, 'success');
});

test('manual search validates input, checks in once, confirms undo and blocks actions on invalid tickets', async () => {
  const hooks = runtime();
  const calls = [];
  const rows = [
    { id: 'ticket-1', attendee_name: 'Test Attendee', status: 'valid', qr_code_hash: 'hash-1', ticket_type_name: 'Standard' },
    { id: 'used', attendee_name: 'Used Attendee', status: 'checked_in', qr_code_hash: 'hash-2', ticket_type_name: 'Standard' },
    { id: 'refunded', attendee_name: 'Refunded Attendee', status: 'refunded', qr_code_hash: 'hash-3', ticket_type_name: 'Standard' },
  ];
  const resultState = { data: rows, loading: false, refreshing: false, error: null, retry() {}, refresh() {} };
  let loader, confirm, finish;
  const { StaffToolsScreen } = load('src/screens/StaffToolsScreen.tsx', {
    react: hooks.react, '@react-navigation/native': { useFocusEffect: hooks.focus },
    'react-native': { ...native, Alert: { alert: (...args) => { confirm = args; } } },
    '../auth/SessionContext': { useSession: () => ({ authed: (fn) => fn('staff-token') }) },
    '../api/checkin': {
      searchTickets: async (...args) => { calls.push(['search', ...args]); return rows; },
      verifyQr: (...args) => { calls.push(['verify', ...args]); return new Promise((resolve) => { finish = resolve; }); },
      undoCheckin: async (...args) => { calls.push(['undo', ...args]); return { result: 'reversed' }; },
    },
    '../hooks/useApiResource': { useApiResource: (fn) => { loader = fn; return resultState; } },
    '../utils/scanOutcome': { outcomeFromResponse: () => ({ headline: 'Checked in', message: 'Success' }) },
    '../theme': { theme, sharedStyles: {} },
    ...Object.fromEntries(['AppButton', 'AttendanceSummary', 'ErrorState', 'LoadingState', 'Screen', 'StatusBadge']
      .map((name) => ['../components/' + name, { [name]: name }])),
  });
  const render = () => hooks.render(StaffToolsScreen, { route: { params: { eventId: 'event-1', eventTitle: 'Event' } } });
  let tree = render(); await hooks.flush();
  let all = nodes(tree);
  const search = () => nodes(render()).find((n) => n.type === 'AppButton' && n.props.title === 'Search tickets').props.onPress();
  search();
  assert.ok(nodes(render()).some((n) => String(n.props?.children).includes('at least two')));
  all.find((n) => n.type === 'TextInput').props.onChangeText(' Attendee ');
  search(); render(); await loader(new AbortController().signal);
  assert.equal(calls[0][0], 'search'); assert.equal(calls[0][3], 'Attendee');
  tree = render();
  const list = nodes(tree).find((n) => n.type === 'FlatList');
  const row = list.props.renderItem({ item: rows[0] });
  const check = nodes(row).find((n) => n.type === 'AppButton').props.onPress;
  check(); check(); assert.equal(calls.filter((c) => c[0] === 'verify').length, 1);
  assert.equal(calls.at(-1)[1], 'staff-token'); assert.equal(calls.at(-1)[3], 'event-1');
  finish({ result: 'valid' }); await hooks.flush();
  const used = list.props.renderItem({ item: rows[1] });
  nodes(used).find((n) => n.type === 'AppButton').props.onPress();
  assert.equal(calls.filter((c) => c[0] === 'undo').length, 0);
  confirm[2].find((b) => b.text === 'Undo check-in').onPress(); await hooks.flush();
  assert.equal(calls.filter((c) => c[0] === 'undo').length, 1);
  const invalid = list.props.renderItem({ item: rows[2] });
  assert.equal(nodes(invalid).filter((n) => n.type === 'AppButton').length, 0);
  hooks.cleanup();
});

test('camera scanner locks repeated callbacks, ignores interrupted results and opens staff tools', async () => {
  const hooks = runtime();
  const listeners = new Set();
  const app = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const emit = (state) => { app.currentState = state; for (const fn of listeners) fn(state); };
  const calls = [];
  const pending = [];
  let options, destination;
  const { ScanScreen } = load('src/screens/ScanScreen.tsx', {
    react: hooks.react,
    '@react-navigation/native': { useFocusEffect: hooks.focus, useIsFocused: () => true },
    'react-native': { ...native, AppState: app, Vibration: { vibrate() {} } },
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }] },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../auth/SessionContext': { useSession: () => ({ authed: (fn) => fn('staff-token') }) },
    '../api/checkin': { verifyQr: (...args) => { calls.push(args); return new Promise((resolve) => pending.push(resolve)); } },
    '../utils/scanOutcome': { outcomeFromResponse: () => ({ tone: 'success', autoDismiss: false }), outcomeFromError: () => ({ tone: 'warning' }) },
    '../theme': { theme, sharedStyles: {} },
    ...Object.fromEntries(['AppButton', 'LoadingState', 'ScanResultPanel', 'Screen']
      .map((name) => ['../components/' + name, { [name]: name }])),
  });
  const props = { route: { params: { eventId: 'event-1', eventTitle: 'Event' } },
    navigation: { setOptions: (value) => { options = value; }, navigate: (...args) => { destination = args; } } };
  const render = () => hooks.render(ScanScreen, props);
  render(); await hooks.flush();
  const header = options.headerRight(); header.props.onPress();
  assert.equal(destination[0], 'StaffTools'); assert.equal(destination[1].eventId, 'event-1');
  const camera = nodes(render()).find((n) => n.type === 'CameraView');
  camera.props.onBarcodeScanned({ data: 'hash-1' }); camera.props.onBarcodeScanned({ data: 'hash-1' });
  assert.equal(calls.length, 1); assert.equal(calls[0][2], 'event-1');
  emit('background'); assert.equal(calls[0][3].aborted, true);
  assert.equal(nodes(render()).some((n) => n.type === 'CameraView'), false);
  pending[0]({ result: 'valid' }); await hooks.flush();
  assert.equal(nodes(render()).some((n) => n.type === 'ScanResultPanel'), false);
  emit('active');
  const resumed = nodes(render()).find((n) => n.type === 'CameraView');
  resumed.props.onBarcodeScanned({ data: 'hash-2' });
  pending[1]({ result: 'valid' }); await hooks.flush();
  assert.equal(nodes(render()).some((n) => n.type === 'ScanResultPanel'), true);
  hooks.cleanup(); assert.equal(listeners.size, 0);
});
