// Opt-in real HTTP integration. Target an isolated database, never shared demo data.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./runtime.cjs');

const base = process.env.MOBILE_TEST_API_URL;
test('mobile modules share website purchases, scanner state, organizer analytics and staff permissions',
  { skip: !base, timeout: 60000 }, async () => {
    async function api(path, body, token, method = body ? 'POST' : 'GET') {
      const response = await fetch(base + path, { method, headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return response.json();
    }
    const client = load('src/api/client.ts', { '../config/environment': { environment: { apiBaseUrl: base } } }, { fetch });
    const auth = load('src/api/auth.ts', { './client': client });
    const events = load('src/api/events.ts', { './client': client });
    const staff = load('src/api/staff.ts', { './client': client });
    const checkin = load('src/api/checkin.ts', { './client': client });
    const tickets = load('src/api/tickets.ts', { './client': client, '../config/environment': { environment: { apiBaseUrl: base } } });
    const suffix = crypto.randomUUID();
    const organizer = await api('/api/auth/register', { email: `org-${suffix}@test.invalid`,
      full_name: 'Mobile Audit Organizer', password: 'test-password123', role: 'organizer' });
    const notifications = await api('/api/notifications', undefined, organizer.token);
    await api('/api/auth/verify-email', { token: notifications.find((n) => n.kind === 'verify_email').body.split(': ').at(-1) });
    const event = await api('/api/events', { title: `Mobile Audit ${suffix}`, venue_name: 'Audit Hall',
      venue_address: 'Test address', description: 'Details shared by web and mobile', refund_policy: 'Demo policy',
      start_time: '2030-12-20T18:00:00+05:00', capacity: 20 }, organizer.token);
    const type = await api(`/api/events/${event.id}/ticket-types`, { name: 'Free admission', price: 0, total_quantity: 10 }, organizer.token);
    await api(`/api/events/${event.id}/publish`, undefined, organizer.token, 'POST');
    const staffEmail = `staff-${suffix}@test.invalid`;
    const invitation = await api(`/api/events/${event.id}/staff`, { mode: 'create', email: staffEmail,
      full_name: 'Mobile Audit Staff', password: 'test-password123' }, organizer.token);
    const door = await auth.login(staffEmail, 'test-password123');
    const attendee = await auth.registerAttendee({ full_name: 'Mobile Audit Attendee',
      email: `attendee-${suffix}@test.invalid`, password: 'test-password123' });
    // The same quote/checkout HTTP contract used by the website, kept outside mobile production code.
    const body = { event_id: event.id, ticket_type_id: type.id, quantity: 1 };
    assert.equal(Number((await api('/api/orders/quote', body, attendee.token)).total), 0);
    const purchase = await api('/api/orders/checkout', { ...body, attendee_name: 'Mobile Audit Attendee' }, attendee.token);
    const list = await tickets.getMyTickets(attendee.token);
    assert.equal(list.length, 1); assert.equal(list[0].id, purchase.ticket.id);
    assert.equal(list[0].status, 'valid'); assert.equal(list[0].ticket_type_name, 'Free admission');
    const png = await fetch(tickets.getTicketQrImageUrl(list[0].id));
    assert.equal(png.status, 200); assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal((await events.getEvents(undefined, attendee.token)).some((e) => e.id === event.id), true);
    const detail = await events.getEvent(event.id, undefined, attendee.token);
    assert.equal(detail.refund_policy, 'Demo policy'); assert.equal(detail.venue_address, 'Test address');
    assert.equal((await staff.getStaffEvents(door.token)).length, 1);
    const matches = await checkin.searchTickets(door.token, event.id, 'Audit Attendee');
    assert.equal(matches.length, 1);
    const wrong = await checkin.verifyQr(door.token, matches[0].qr_code_hash, crypto.randomUUID());
    assert.equal(wrong.result, 'wrong_event'); assert.equal(wrong.attendee_name, undefined);
    assert.equal((await checkin.verifyQr(door.token, matches[0].qr_code_hash, event.id)).result, 'valid');
    assert.equal((await checkin.verifyQr(door.token, matches[0].qr_code_hash, event.id)).result, 'already_checked_in');
    assert.equal((await tickets.getMyTickets(attendee.token))[0].status, 'checked_in');
    assert.equal((await checkin.getAttendanceStats(door.token, event.id)).checked_in, 1);
    const analytics = await events.getEventAnalytics(event.id, organizer.token);
    assert.equal(analytics.attendance.checked_in, 1); assert.equal(analytics.inventory.sold, 1);
    await checkin.undoCheckin(door.token, list[0].id);
    assert.equal((await tickets.getMyTickets(attendee.token))[0].status, 'valid');
    assert.equal((await checkin.getAttendanceStats(door.token, event.id)).checked_in, 0);
    await assert.rejects(checkin.searchTickets(attendee.token, event.id, 'Audit'), (error) => error.status === 403);
    await api(`/api/events/${event.id}/staff/${invitation.staff.id}`, undefined, organizer.token, 'DELETE');
    assert.equal((await staff.getStaffEvents(door.token)).length, 0);
    await assert.rejects(checkin.verifyQr(door.token, matches[0].qr_code_hash, event.id), (error) => error.status === 403);
    await assert.rejects(checkin.undoCheckin(door.token, list[0].id), (error) => error.status === 403);
    await assert.rejects(checkin.getAttendanceStats(door.token, event.id), (error) => error.status === 403);
    await assert.rejects(tickets.getMyTickets('expired-token'), (error) => error.status === 401);
    console.log('Shared purchase/ticket, PNG, search, wrong-event, duplicate, undo, counts, analytics and revoked permissions verified over Docker HTTP.');
  });
