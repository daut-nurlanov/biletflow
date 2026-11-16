const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime, native, theme, nodes } = require('./runtime.cjs');

test('support APIs use bearer tokens, encoded IDs and server-owned context/status', async () => {
  const calls = [];
  const support = load('src/api/support.ts', { './client': { apiRequest: async (...args) => { calls.push(args); return {}; } } });
  await support.createSupportCase('token', 'payment', ' Help ', { ticketId: 'ticket-1' });
  await support.getSupportCases('token'); await support.getSupportCase('token', 'case/1');
  await support.replyToSupport('token', 'case/1', ' Reply ');
  await support.setSupportStatus('token', 'case/1', 'resolved');
  assert.equal(calls[0][1].body.message, 'Help'); assert.equal(calls[0][1].body.ticket_id, 'ticket-1');
  assert.equal(calls[2][0], '/api/support/cases/case%2F1');
  assert.equal(calls[3][0], '/api/support/cases/case%2F1/messages');
  assert.equal(calls[3][1].body.message, 'Reply');
  assert.equal(calls[4][1].body.status, 'resolved');
  for (const call of calls) assert.equal(call[1].token, 'token');
});

test('support creation validates drafts, locks double taps and navigates only after server confirmation', async () => {
  const hooks = runtime(); let calls = 0, finish, destination;
  const { SupportNewScreen } = load('src/screens/SupportNewScreen.tsx', {
    react: hooks.react, 'react-native': { ...native, ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView' },
    '../auth/SessionContext': { useSession: () => ({ state: { status: 'signedIn', user: { role: 'attendee' } }, authed: (fn) => fn('token') }) },
    '../api/orders': { getMyOrders: async () => [] },
    '../api/support': { createSupportCase: (...args) => { calls++; assert.equal(args[3].ticketId, 'ticket-1'); return new Promise((resolve) => { finish = resolve; }); } },
    '../hooks/useApiResource': { useApiResource: () => ({ data: [], loading: false }) },
    '../types/support': load('src/types/support.ts'), '../utils/formatting': { formatDateTime: (v) => v },
    '../theme': { sharedStyles: {}, theme }, '../theme/forms': { formStyles: {} },
    '../components/AppButton': { AppButton: 'AppButton' }, '../components/ErrorState': { ErrorState: 'ErrorState' }, '../components/Screen': { Screen: 'Screen' },
  });
  const render = () => hooks.render(SupportNewScreen, { route: { params: { ticketId: 'ticket-1' } },
    navigation: { replace: (...args) => { destination = args; } } });
  let tree = render();
  const submit = () => nodes(render()).find((n) => n.type === 'AppButton').props.onPress();
  submit(); assert.equal(calls, 0);
  assert.ok(nodes(render()).some((n) => String(n.props?.children).includes('1 to 4,000')));
  nodes(tree).find((n) => n.type === 'TextInput').props.onChangeText('Need help with my ticket');
  submit(); submit(); assert.equal(calls, 1); assert.equal(destination, undefined);
  finish({ id: 'case-1' }); await hooks.flush();
  assert.equal(destination[0], 'SupportThread'); assert.equal(destination[1].caseId, 'case-1');
  hooks.cleanup();
});

test('thread replies retain failed drafts, retry once and expose status controls only to handlers', async () => {
  const hooks = runtime(); let fail = true, sent = 0, role = 'owner';
  const current = { id: 'case-1', category: 'payment', status: 'open', messages: [], your_role_in_case: role };
  const { SupportThreadScreen } = load('src/screens/SupportThreadScreen.tsx', {
    react: hooks.react, 'react-native': { ...native, KeyboardAvoidingView: 'KeyboardAvoidingView' },
    '../auth/SessionContext': { useSession: () => ({ state: { status: 'signedIn', user: { id: 'buyer-1' } }, authed: (fn) => fn('token') }) },
    '../api/support': { getSupportCase: async () => current,
      replyToSupport: async () => { sent++; if (fail) throw new Error('Offline'); return { id: 'reply-1' }; } },
    '../hooks/useApiResource': { useApiResource: () => ({ data: { ...current, your_role_in_case: role }, loading: false, refreshing: false, refresh() {} }) },
    '../types/support': load('src/types/support.ts'), '../utils/formatting': { formatDateTime: (v) => v },
    '../theme': { sharedStyles: {}, theme }, '../theme/forms': { formStyles: {} },
    ...Object.fromEntries(['AppButton', 'ErrorState', 'LoadingState', 'Screen'].map((name) => ['../components/' + name, { [name]: name }])),
  });
  const render = () => hooks.render(SupportThreadScreen, { route: { params: { caseId: 'case-1' } } });
  function footer() { return nodes(render()).find((n) => n.type === 'FlatList').props.ListFooterComponent; }
  nodes(footer()).find((n) => n.type === 'TextInput').props.onChangeText('Draft reply');
  let button = nodes(footer()).find((n) => n.type === 'AppButton');
  button.props.onPress(); button.props.onPress(); await hooks.flush();
  assert.equal(sent, 1); assert.equal(nodes(footer()).find((n) => n.type === 'TextInput').props.value, 'Draft reply');
  fail = false; nodes(footer()).find((n) => n.type === 'AppButton').props.onPress(); await hooks.flush();
  assert.equal(sent, 2); assert.equal(nodes(footer()).find((n) => n.type === 'TextInput').props.value, '');
  assert.equal(nodes(render()).filter((n) => n.type === 'AppButton' && n.props.title === 'Resolved').length, 0);
  role = 'handler'; assert.equal(nodes(render()).filter((n) => n.type === 'AppButton' && n.props.title === 'Resolved').length, 1);
  hooks.cleanup();
});
