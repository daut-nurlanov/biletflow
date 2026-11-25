const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, messages, native, nodes, runtime, theme } = require('./runtime.cjs');

test('selected Kazakh and Russian update the UI and persist in native storage', async () => {
  const hooks = runtime();
  let stored = 'kk';
  const writes = [];
  const { LocaleProvider } = load('src/i18n/LocaleContext.tsx', {
    react: hooks.react, 'react-native': native, './messages': messages,
    'expo-secure-store': {
      getItemAsync: async () => stored,
      setItemAsync: async (key, value) => { writes.push([key, value]); stored = value; },
    },
  });
  const value = () => hooks.render(LocaleProvider).props.value;
  assert.equal(value().t('Sign in'), 'Sign in');
  await hooks.flush();
  assert.equal(value().lang, 'kk');
  assert.equal(value().t('Sign in'), 'Кіру');
  value().setLang('en');
  value().setLang('ru');
  assert.equal(value().t('Sign in'), 'Войти');
  await hooks.flush();
  assert.deepEqual(writes, [['biletflow.lang', 'en'], ['biletflow.lang', 'ru']]);
  assert.equal(stored, 'ru');
  assert.equal(messages.translate('{name}', 'kk', { name: '$& {unchanged}' }), '$& {unchanged}');
  hooks.cleanup();
});

test('an interrupted password reset request leaves the send control available for retry', async () => {
  const hooks = runtime();
  const validation = load('src/utils/registration.ts');
  let requests = 0;
  const { ForgotPasswordScreen } = load('src/screens/ForgotPasswordScreen.tsx', {
    react: hooks.react, 'react-native': native, '../utils/registration': validation,
    '../api/auth': {
      forgotPassword: async () => { if (++requests === 1) throw new Error('Network unavailable'); },
    },
    '../components/AppButton': { AppButton: 'AppButton' }, '../components/Screen': { Screen: 'Screen' },
    '../theme': { theme, sharedStyles: {} }, '../theme/forms': { formStyles: {} },
  });
  const ui = () => nodes(hooks.render(ForgotPasswordScreen, { navigation: {} }));
  const input = (label) => ui().find((element) => element.type === 'TextInput' && element.props.accessibilityLabel === label);
  const send = () => ui().find((element) => element.type === 'AppButton' && element.props.title === 'Send reset code');
  input('Email').props.onChangeText('isolated@test.invalid');
  await send().props.onPress();
  assert.ok(ui().some((element) => element.props.children === 'Network unavailable'));
  assert.equal(input('Reset code'), undefined);
  await send().props.onPress();
  assert.ok(input('Reset code'));
  assert.equal(requests, 2);
  assert.ok(validation.passwordValidation('🎟'.repeat(19)));
});
