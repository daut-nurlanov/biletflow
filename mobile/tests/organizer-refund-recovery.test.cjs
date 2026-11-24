const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime, nodes, native, theme } = require('./runtime.cjs');

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function harness() {
  const hooks = runtime();
  const alert = { current: null };
  const session = { authed: (request) => request('organizer-token') };
  const fixture = { id: 'order-1', event_id: 'event-1', status: 'paid', total_amount: 1500,
    tickets: [{ id: 'ticket-1', status: 'valid' }], refunds: [] };
  let refundResult;
  const api = {
    reads: 0, writes: 0, read: () => fixture,
    async getOrderDetail() { api.reads++; return api.read(); },
    refundOrder() {
      api.writes++;
      return new Promise((resolve, reject) => { refundResult = { resolve, reject }; });
    },
  };
  const { OrderDetailScreen } = load('src/screens/OrderDetailScreen.tsx', {
    react: hooks.react,
    'react-native': { ...native, KeyboardAvoidingView: 'KeyboardAvoidingView', ScrollView: 'ScrollView',
      Alert: { alert: (_title, _body, buttons) => { alert.current = buttons[1].onPress; } } },
    '../api/client': { ApiError }, '../api/organizer': api,
    '../auth/SessionContext': { useSession: () => session },
    '../components/AppButton': { AppButton: 'AppButton' }, '../components/ErrorState': { ErrorState: 'ErrorState' },
    '../components/LoadingState': { LoadingState: 'LoadingState' }, '../components/Screen': { Screen: 'Screen' },
    '../components/StatusBadge': { StatusBadge: 'StatusBadge' }, '../theme': { sharedStyles: {}, theme },
    '../theme/forms': { formStyles: {} }, '../utils/formatting': { formatMoney: String, formatDateTime: () => '' },
    '../utils/organizerOrders': load('src/utils/organizerOrders.ts', { '../api/client': { ApiError } }),
    '../hooks/useApiResource': load('src/hooks/useApiResource.ts', {
      react: hooks.react, '@react-navigation/native': { useFocusEffect: hooks.focus },
      'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    }),
  });
  const render = () => hooks.render(OrderDetailScreen, { route: { params: { eventId: 'event-1', orderId: 'order-1' } } });
  async function settle() {
    for (let step = 0; step < 4; step++) { render(); await hooks.flush(); }
    return render();
  }
  const button = (name) => nodes(render()).find((node) => node.type === 'AppButton' &&
    [node.props.title, node.props.accessibilityLabel].includes(name))?.props;
  const content = () => JSON.stringify(render());
  return { api, alert, fixture, settle, button, content, get refundResult() { return refundResult; } };
}

test('a lost refund response cannot be retried and a fresh refunded status resolves it', async () => {
  const h = harness();
  await h.settle();
  h.button('Refund order').onPress();
  h.alert.current();
  h.alert.current();
  assert.equal(h.api.writes, 1);
  h.api.read = () => { throw new Error('Status unavailable'); };
  h.refundResult.reject(new Error('The request timed out'));
  await h.settle();
  assert.match(h.content(), /outcome is unknown/);
  assert.equal(h.button('Refund order').disabled, true);
  h.button('Refund order').onPress();
  h.alert.current();
  assert.equal(h.api.writes, 1);
  h.button('Refresh order').onPress();
  await h.settle();
  assert.equal(h.button('Refund order').disabled, true);
  h.api.read = () => ({ ...h.fixture, status: 'refunded',
    tickets: [{ id: 'ticket-1', status: 'refunded' }], refunds: [{ id: 'refund-1', amount: 1500 }] });
  h.button('Refresh order').onPress();
  await h.settle();
  assert.match(h.content(), /server confirmed the refund/);
  assert.equal(h.button('Refund order'), undefined);
  assert.equal(h.api.writes, 1);
});

test('a refund can be deliberately retried once a fresh read confirms eligibility', async () => {
  const h = harness();
  await h.settle();
  h.button('Refund order').onPress();
  h.alert.current();
  h.api.read = () => { throw new Error('Offline'); };
  h.refundResult.reject(new Error('Offline'));
  await h.settle();
  assert.equal(h.button('Refund order').disabled, true);
  h.api.read = () => h.fixture;
  h.button('Refresh order').onPress();
  await h.settle();
  assert.equal(h.button('Refund order').disabled, false);
  assert.equal(h.api.writes, 1);
  h.button('Refund order').onPress();
  h.alert.current();
  h.alert.current();
  assert.equal(h.api.writes, 2);
  h.api.read = () => ({ ...h.fixture, status: 'refunded' });
  h.refundResult.resolve({});
  await h.settle();
  assert.equal(h.button('Refund order'), undefined);
});
