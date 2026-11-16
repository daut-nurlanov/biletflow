const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the actual TS/TSX modules without installing a second React renderer.
// Native keyboard, layout and camera behavior still require a physical device.
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return module.exports;
}

test('attendee registration validation matches Unicode and bcrypt limits', () => {
  const { validateRegistration } = load('src/utils/registration.ts', {});
  const valid = { full_name: 'Test Attendee', email: 'attendee@example.com', password: 'password123' };
  const validate = (changes) => {
    const input = { ...valid, ...changes };
    return validateRegistration(input, input.password);
  };
  assert.equal(Object.keys(validate({})).length, 0);
  assert.ok(validate({ full_name: '   ' }).full_name);
  assert.ok(validate({ full_name: 'x'.repeat(121) }).full_name);
  assert.ok(validate({ email: 'not-an-email' }).email);
  assert.ok(validate({ password: 'short' }).password);
  assert.ok(validate({ password: '\u00e9'.repeat(37) }).password);
  assert.equal(validate({ password: '\u00e9'.repeat(36) }).password, undefined);
  assert.ok(validateRegistration(valid, 'mismatched').confirmPassword);
});

test('registration forces attendee role and My Tickets sends the current token and signal', async () => {
  const calls = [];
  const client = { apiRequest: (path, options) => { calls.push({ path, options }); return Promise.resolve([]); } };
  const { registerAttendee } = load('src/api/auth.ts', { './client': client });
  await registerAttendee({ full_name: '  Attendee  ', email: ' ATTENDEE@EXAMPLE.COM ', password: ' space123 ', role: 'platform_admin' });
  assert.equal(calls[0].path, '/api/auth/register');
  assert.equal(calls[0].options.body.role, 'attendee');
  assert.equal(calls[0].options.body.email, 'attendee@example.com');
  assert.equal(calls[0].options.body.full_name, 'Attendee');
  assert.equal(calls[0].options.body.password, ' space123 ');
  const { getMyTickets, getTicketQrImageUrl } = load('src/api/tickets.ts', {
    './client': client, '../config/environment': { environment: { apiBaseUrl: 'https://test.invalid' } },
  });
  const signal = new AbortController().signal;
  await getMyTickets('current-attendee-token', signal);
  assert.equal(calls[1].path, '/api/tickets/my-tickets');
  assert.equal(calls[1].options.token, 'current-attendee-token');
  assert.equal(calls[1].options.signal, signal);
  assert.equal(getTicketQrImageUrl('ticket/unsafe?'), 'https://test.invalid/api/tickets/ticket%2Funsafe%3F/qr.png');
});

test('admission QR visibility covers all ticket and event status combinations', () => {
  const qr = () => null;
  const { TicketCard } = load('src/components/TicketCard.tsx', {
    'react-native': { Text: 'Text', View: 'View' }, '../theme': { sharedStyles: {} },
    '../utils/formatting': { formatDateTime: () => 'Date' },
    './StatusBadge': { StatusBadge: 'StatusBadge' }, './TicketQrCode': { TicketQrCode: qr },
  });
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object') return [];
    return [value, ...nodes(value.props?.children)];
  }
  for (const status of ['valid', 'checked_in', 'cancelled', 'refunded']) {
    for (const event_status of ['draft', 'upcoming', 'active', 'completed', 'cancelled', 'suspended']) {
      const tree = TicketCard({ ticket: { status, event_status, event_title: 'Event', attendee_name: 'Attendee' },
        qrImageSource: { uri: 'https://test.invalid/qr.png' } });
      assert.equal(nodes(tree).filter((node) => node.type === qr).length,
        status === 'valid' && !['cancelled', 'suspended'].includes(event_status) ? 1 : 0,
        `${status}/${event_status}`);
    }
  }
});
