const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, runtime, native, theme, nodes } = require('./runtime.cjs');
const { checkoutHarness } = require('./checkout-runtime.cjs');

const base = process.env.MOBILE_PURCHASE_TEST_API_URL;
test('native purchase controller -> real quote/checkout -> My Tickets/QR -> staff -> support conversation',
  { skip: !base, timeout: 60000 }, async () => {
    const client = load('src/api/client.ts', { '../config/environment': { environment: { apiBaseUrl: base } } }, { fetch });
    const orders = load('src/api/orders.ts', { './client': client });
    const promotions = load('src/api/promotions.ts', { './client': client });
    const support = load('src/api/support.ts', { './client': client });
    const auth = load('src/api/auth.ts', { './client': client });
    const events = load('src/api/events.ts', { './client': client });
    const tickets = load('src/api/tickets.ts', { './client': client, '../config/environment': { environment: { apiBaseUrl: base } } });
    const checkin = load('src/api/checkin.ts', { './client': client });
    async function api(path, body, token, method = body ? 'POST' : 'GET') {
      return client.apiRequest(path, { body, token, method });
    }
    const suffix = crypto.randomUUID();
    const organizer = await api('/api/auth/register', { email: `org-${suffix}@test.invalid`, full_name: 'Checkout Organizer', password: 'test-password123', role: 'organizer' });
    const notifications = await api('/api/notifications', undefined, organizer.token);
    await api('/api/auth/verify-email', { token: notifications.find((n) => n.kind === 'verify_email').body.split(': ').at(-1) });
    await api('/api/organizer/profile', { contact_phone: '+7 701 000 0000', payout_account_details: 'Simulated account' }, organizer.token, 'PUT');
    await api('/api/organizer/profile/verify', undefined, organizer.token, 'POST');
    const event = await api('/api/events', { title: `Native purchase ${suffix}`, venue_name: 'Test Hall', start_time: '2030-12-20T18:00:00+05:00', capacity: 30 }, organizer.token);
    const paid = await api(`/api/events/${event.id}/ticket-types`, { name: 'Paid admission', price: 2000, total_quantity: 10 }, organizer.token);
    const free = await api(`/api/events/${event.id}/ticket-types`, { name: 'Free admission', price: 0, total_quantity: 10 }, organizer.token);
    await api(`/api/events/${event.id}/publish`, undefined, organizer.token, 'POST');
    await api(`/api/events/${event.id}/activate-paid`, { accept_terms: true }, organizer.token);
    const campaign = await api(`/api/events/${event.id}/promo-campaigns`, { discount_type: 'percentage', discount_value: 20, max_redemptions: 10 }, organizer.token);
    const attendee = await auth.registerAttendee({ full_name: 'Native Buyer', email: `buyer-${suffix}@test.invalid`, password: 'test-password123' });
    const session = { state: { status: 'signedIn', user: attendee }, authed: (fn) => fn(attendee.token) };
    assert.ok((await events.getEvents(undefined, attendee.token)).some((e) => e.id === event.id));
    const details = await events.getEvent(event.id, undefined, attendee.token);
    async function ready(h, predicate = (view) => view.canBuy) {
      for (let i = 0; i < 200; i++) {
        await h.settle();
        if (predicate(h.view)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Checkout did not settle: ${h.view.error || h.view.quotes.error || h.view.invalid || 'pending'}`);
    }
    const paidFlow = checkoutHarness({ event: details, initialTypeId: paid.id, session, api: orders, promotions,
      ApiError: client.ApiError, initialCampaignToken: new URL(campaign.campaign_link).searchParams.get('c') });
    await ready(paidFlow); paidFlow.view.change({ quantity: 2 }); await ready(paidFlow);
    assert.equal(Number(paidFlow.view.reviewed.value.total), 3200);
    assert.equal(paidFlow.view.form.promo, campaign.code);
    assert.equal(paidFlow.view.canBuy, true);
    // Real server validation after a successful quote, then correct the field
    // without an Apply tap. The generated fixture code comes from the API.
    await paidFlow.view.applyPromo('INVALID-' + suffix);
    await ready(paidFlow, (view) => !!view.promoError);
    assert.equal(paidFlow.view.canBuy, false);
    await paidFlow.view.purchase();
    assert.equal(paidFlow.calls.filter((c) => c.method === 'checkoutOrder').length, 0);
    paidFlow.view.changePromo(campaign.code); await paidFlow.settle();
    assert.equal(paidFlow.view.canBuy, false);
    for (const [callback, delay] of [...paidFlow.timers]) if (delay === 350) {
      paidFlow.timers.delete(callback); callback();
    }
    await ready(paidFlow);
    assert.equal(paidFlow.view.promoError, null);
    assert.equal(Number(paidFlow.view.reviewed.value.total), 3200);
    await paidFlow.view.purchase(); await paidFlow.settle();
    assert.equal(paidFlow.view.confirmation.tickets.length, 2);
    assert.equal(Number(paidFlow.view.confirmation.order.total_amount), 3200);
    // Render the actual confirmation component and use its native My Tickets action.
    let destination;
    const ui = runtime();
    const checkoutScreen = load('src/screens/CheckoutScreen.tsx', {
      react: ui.react, 'react-native': native,
      '../api/events': events, '../auth/SessionContext': { useSession: () => session },
      '../hooks/useApiResource': { useApiResource: () => ({ data: details, loading: false }) },
      '../hooks/useCheckout': { useCheckout: () => paidFlow.view },
      '../theme': { theme, sharedStyles: {} }, '../theme/forms': { formStyles: {} },
      '../utils/formatting': { formatMoney: (v) => String(v), formatPrice: (v) => String(v) },
      ...Object.fromEntries(['AppButton', 'ErrorState', 'LoadingState', 'Screen'].map((name) => ['../components/' + name, { [name]: name }])),
    });
    const form = ui.render(checkoutScreen.CheckoutScreen, { route: { params: { eventId: event.id } }, navigation: { navigate: (name) => { destination = name; } } });
    const confirmation = ui.render(form.type, form.props);
    nodes(confirmation).find((n) => n.type === 'AppButton' && n.props.title === 'Open My Tickets').props.onPress();
    assert.equal(destination, 'MyTickets'); ui.cleanup();
    const freeFlow = checkoutHarness({ event: details, initialTypeId: free.id, session, api: orders, promotions, ApiError: client.ApiError });
    await ready(freeFlow);
    await freeFlow.view.applyPromo('INVALID-' + suffix);
    await ready(freeFlow, (view) => !!view.promoError);
    await freeFlow.view.applyPromo(''); await ready(freeFlow);
    assert.equal(freeFlow.view.reviewed.value.promo_code, null);
    await freeFlow.view.purchase(); await freeFlow.settle();
    assert.equal(Number(freeFlow.view.confirmation.order.total_amount), 0);
    const mine = await tickets.getMyTickets(attendee.token); assert.equal(mine.length, 3);
    const ticket = mine.find((t) => t.ticket_type_id === paid.id);
    const png = await tickets.getTicketQr(ticket.id, attendee.token);
    assert.equal(png.type, 'image/png');
    const staffEmail = `staff-${suffix}@test.invalid`;
    await api(`/api/events/${event.id}/staff`, { mode: 'create', email: staffEmail, full_name: 'Door Staff', password: 'test-password123' }, organizer.token);
    const staff = await auth.login(staffEmail, 'test-password123');
    assert.equal((await checkin.verifyQr(staff.token, ticket.qr_code_hash, event.id)).result, 'valid');
    assert.equal((await checkin.verifyQr(staff.token, ticket.qr_code_hash, event.id)).result, 'already_checked_in');
    assert.equal((await tickets.getMyTickets(attendee.token)).find((t) => t.id === ticket.id).status, 'checked_in');
    const issue = await support.createSupportCase(attendee.token, 'ticket_delivery', 'Help with my ticket', { ticketId: ticket.id });
    assert.ok((await support.getSupportCases(attendee.token)).some((c) => c.id === issue.id));
    assert.equal((await support.getSupportCase(organizer.token, issue.id)).your_role_in_case, 'handler');
    await support.replyToSupport(organizer.token, issue.id, 'Your ticket is visible in My Tickets');
    await support.setSupportStatus(organizer.token, issue.id, 'resolved');
    await support.replyToSupport(attendee.token, issue.id, 'Thank you, one more question');
    const conversation = await support.getSupportCase(attendee.token, issue.id);
    assert.equal(conversation.messages.length, 3); assert.equal(conversation.status, 'open');
    await assert.rejects(support.getSupportCase(staff.token, issue.id), (e) => e.status === 404);
    // Revalidate a quote when another buyer consumes the remaining inventory.
    const staleFlow = checkoutHarness({ event: details, initialTypeId: paid.id, session, api: orders, promotions, ApiError: client.ApiError });
    await ready(staleFlow);
    await api(`/api/ticket-types/${paid.id}`, { total_quantity: 2 }, organizer.token, 'PUT');
    await staleFlow.view.purchase(); await staleFlow.settle();
    assert.equal(staleFlow.view.confirmation, null);
    assert.equal(staleFlow.calls.filter((c) => c.method === 'checkoutOrder').length, 0);
    assert.match(staleFlow.view.error, /Sold out/);
    assert.equal((await orders.getMyOrders(attendee.token)).length, 2);
    // Drop a response only after the actual backend committed, then recover on remount.
    const recoveryStore = new Map(); let dropResponse = true;
    const interrupted = checkoutHarness({ store: recoveryStore, event: details, initialTypeId: free.id, session,
      promotions, ApiError: client.ApiError, api: { ...orders, checkoutOrder: async (...args) => {
        const result = await orders.checkoutOrder(...args);
        if (dropResponse) { dropResponse = false; throw new Error('Response lost after server commit'); }
        return result;
      } } });
    await ready(interrupted); await interrupted.view.purchase(); await interrupted.settle();
    assert.equal(interrupted.view.confirmation, null); assert.ok(recoveryStore.get('attempt'));
    interrupted.hooks.cleanup();
    const recovered = checkoutHarness({ store: recoveryStore, event: details, initialTypeId: free.id,
      session, promotions, ApiError: client.ApiError, api: orders });
    await ready(recovered); await recovered.view.purchase(); await recovered.settle();
    assert.equal(recovered.view.confirmation.repeated, true);
    assert.equal((await orders.getMyOrders(attendee.token)).length, 3);
    recovered.hooks.cleanup();
    paidFlow.hooks.cleanup(); freeFlow.hooks.cleanup(); staleFlow.hooks.cleanup();
    console.log('Native controller free/paid/promo purchase, confirmation navigation, My Tickets, PNG, staff duplicate rejection, stock change and support replies verified over Docker.');
  });
