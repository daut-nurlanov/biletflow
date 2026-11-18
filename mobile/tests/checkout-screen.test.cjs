const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, native, nodes } = require('./runtime.cjs');
const { eventFixture } = require('./checkout-runtime.cjs');

test('background availability refresh preserves the mounted checkout and its confirmation', () => {
  const resource = { data: eventFixture, loading: false, error: null, refresh() {} };
  const { CheckoutScreen } = load('src/screens/CheckoutScreen.tsx', {
    react: { useCallback: (fn) => fn }, 'react-native': native,
    '../api/events': {}, '../auth/SessionContext': { useSession: () => ({ state: { status: 'signedIn', user: { id: 'buyer-1' } } }) },
    '../components/AppButton': { AppButton: 'AppButton' }, '../components/ErrorState': { ErrorState: 'ErrorState' },
    '../components/LoadingState': { LoadingState: 'LoadingState' }, '../components/Screen': { Screen: 'Screen' },
    '../hooks/useApiResource': { useApiResource: () => resource }, '../hooks/useCheckout': {},
    '../theme': { sharedStyles: {} }, '../theme/forms': { formStyles: {} }, '../utils/formatting': {},
  });
  const props = { route: { params: { eventId: eventFixture.id } }, navigation: { navigate() {} } };
  const original = CheckoutScreen(props);
  // React retains the child's selection, receipt and in-flight recovery state
  // only when its component type and key survive the parent's refresh renders.
  for (const error of [null, 'Availability refresh failed']) {
    resource.loading = !error; resource.error = error;
    const refreshed = CheckoutScreen(props);
    assert.equal(refreshed.type, original.type);
    assert.equal(refreshed.key, original.key);
  }
  resource.data = null; resource.loading = true; resource.error = null;
  assert.ok(nodes(CheckoutScreen(props)).some((node) => node.type === 'LoadingState'));
  resource.loading = false; resource.error = 'Event not found';
  assert.ok(nodes(CheckoutScreen(props)).some((node) => node.type === 'ErrorState'));
});
