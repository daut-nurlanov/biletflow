// Opt in with LIVE_API_URL pointing at an isolated audit database's API.
// Creates unique test records through HTTP; never modifies seeded/demo records.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Browser, eventually } from './browser-helper.mjs'

const apiBase = process.env.LIVE_API_URL
const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)

test('live Docker: attendee purchase, organizer support, staff and history',
  { skip: !apiBase || !chrome, timeout: 120_000 }, async () => {
    async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
      const response = await fetch(apiBase + path, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined })
      assert.ok(response.ok, `${path}: HTTP ${response.status} ${await response.clone().text()}`)
      return response.json()
    }
    const suffix = crypto.randomUUID()
    const organizer = await request('/api/auth/register', { body: { full_name: 'Audit Organizer',
      email: `audit-org-${suffix}@test.invalid`, password: 'audit-pass-123', role: 'organizer' } })
    const org = organizer.token
    const notifications = await request('/api/notifications', { token: org })
    const verification = notifications.find((item) => item.kind === 'verify_email').body.split(': ').at(-1)
    await request('/api/auth/verify-email', { body: { token: verification } })
    await request('/api/organizer/profile', { token: org, method: 'PUT',
      body: { contact_phone: '+7 701 000 0000', payout_account_details: 'Simulated payout account' } })
    await request('/api/organizer/profile/verify', { token: org, method: 'POST' })
    const event = await request('/api/events', { token: org, body: { title: `Audit live ${suffix}`,
      venue_name: 'Audit Hall', start_time: '2030-11-20T18:00:00+05:00', capacity: 20 } })
    for (const [name, price] of [['Paid admission', 5000], ['Free admission', 0]]) {
      await request(`/api/events/${event.id}/ticket-types`, { token: org,
        body: { name, price, total_quantity: 10 } })
    }
    await request(`/api/events/${event.id}/publish`, { token: org, method: 'POST' })
    await request(`/api/events/${event.id}/activate-paid`, { token: org, body: { accept_terms: true } })
    const campaign = await request(`/api/events/${event.id}/promo-campaigns`, { token: org,
      body: { discount_type: 'percentage', discount_value: 20, max_redemptions: 10 } })
    const campaignQr = await fetch(`${apiBase}/api/promo-campaigns/${campaign.id}/qr.png`,
      { headers: { Authorization: `Bearer ${org}` } })
    assert.equal(campaignQr.headers.get('content-type'), 'image/png')
    const invited = await request(`/api/events/${event.id}/staff`, { token: org,
      body: { full_name: 'Audit Staff', email: `audit-staff-${suffix}@test.invalid`, password: 'audit-pass-123' } })
    const staff = await request('/api/auth/login', { body: { email: invited.staff.email, password: 'audit-pass-123' } })
    const attendee = await request('/api/auth/register', { body: { full_name: 'Audit Attendee',
      email: `audit-buyer-${suffix}@test.invalid`, password: 'audit-pass-123', role: 'attendee' } })

    const profile = await mkdtemp(join(tmpdir(), 'biletflow-live-'))
    const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    const browser = new Browser()
    let stderr = ''
    child.stderr.on('data', (data) => { stderr += data })
    try {
      await eventually(() => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr), 'Chrome startup')
      const address = new URL(stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1])
      const targets = await fetch(`http://${address.host}/json/list`).then((r) => r.json())
      await browser.connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      await browser.navigate('/login')
      await browser.wait('Sign in')
      await browser.evaluate(`localStorage.setItem('biletflow_token', ${JSON.stringify(attendee.token)})`)
      for (const name of ['Paid admission', 'Free admission']) {
        const query = new URL(campaign.campaign_link).search
        await browser.navigate(`/events/${event.id}${query}`)
        await browser.wait(name)
        await browser.evaluate(`([...document.querySelectorAll('button.choice')].find(b => b.textContent.includes(${JSON.stringify(name)}))).click()`)
        await browser.wait('Total')
        if (name === 'Paid admission') {
          await browser.wait('Discount')
          await browser.wait('4,000')
        }
        await browser.click('Buy')
        await browser.wait('Purchase successful')
      }
      const tickets = await request('/api/tickets/my-tickets', { token: attendee.token })
      assert.equal(tickets.length, 2)
      await eventually(() => browser.evaluate('document.querySelectorAll("img.qr").length === 2 && [...document.querySelectorAll("img.qr")].every(i => i.complete && i.naturalWidth > 0)'), 'Real QR images loaded')
      const orders = await request('/api/orders/my-orders', { token: attendee.token })
      assert.deepEqual(orders.map((o) => Number(o.total_amount)).sort((a, b) => a - b), [0, 4000])
      const ticket = tickets[0]
      const scan = { event_id: event.id, qr_code_hash: ticket.qr_code_hash }
      assert.equal((await request('/api/checkin/verify-qr', { token: staff.token, body: scan })).result, 'valid')
      assert.equal((await request('/api/checkin/verify-qr', { token: staff.token, body: scan })).result, 'already_checked_in')
      const stats = await request(`/api/events/${event.id}/checkin-stats`, { token: staff.token })
      assert.equal(stats.checked_in, 1)
      await browser.navigate('/my-tickets')
      await browser.wait(event.title)
      assert.equal(await browser.evaluate('document.querySelectorAll("img.qr").length'), 1)
      const analytics = await request(`/api/events/${event.id}/analytics`, { token: org })
      assert.equal(Number(analytics.money.gross_sales), 5000)
      assert.equal(Number(analytics.money.discounts), 1000)
      assert.equal(Number(analytics.money.net_revenue), 4000)
      assert.equal(analytics.inventory.sold, 2)
      assert.equal(analytics.inventory.remaining, 18)
      assert.equal(analytics.attendance.checked_in, 1)
      await browser.evaluate(`localStorage.setItem('biletflow_token', ${JSON.stringify(org)})`)
      await browser.navigate(`/organizer/events/${event.id}/analytics`)
      await browser.wait('Campaign performance')
      assert.ok(await browser.evaluate(`document.querySelector('[aria-labelledby="revenue-title"]').textContent.includes('4,000')`))
      assert.ok(await browser.evaluate(`document.querySelector('svg[role="img"]') !== null`))

      const support = await request('/api/support/cases', { token: attendee.token, body: {
        category: 'payment', order_id: orders.find((order) => Number(order.total_amount) === 4000).id,
        message: 'Live support inquiry about my order',
      } })
      await browser.navigate(`/support/${support.id}`)
      await browser.wait('Live support inquiry about my order')
      await browser.evaluate(`(() => {
        const input = document.querySelector('#support-reply');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Organizer reply verified in live integration');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await browser.click('Send reply')
      await browser.wait('Organizer reply verified in live integration')
      const conversation = await request(`/api/support/cases/${support.id}`, { token: attendee.token })
      assert.ok(conversation.messages.some((message) => message.message === 'Organizer reply verified in live integration'))
      await browser.navigate(`/organizer/events/${event.id}/staff`)
      await browser.wait('Audit Staff')
      await browser.evaluate('document.querySelector("input[value=create]").click()')
      await browser.wait('Initial password')
      const staffEmail = `audit-ui-staff-${suffix}@test.invalid`
      await browser.evaluate(`(() => {
        const values = ${JSON.stringify({ email: staffEmail, full_name: 'UI Door Staff', password: 'audit-staff-pass-123', confirm_password: 'audit-staff-pass-123' })};
        for (const [name, value] of Object.entries(values)) {
          const input = document.querySelector('input[name="' + name + '"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`)
      await browser.click('Create and assign')
      await browser.wait('Staff account created and assigned')
      await browser.wait(staffEmail)
      const uiStaff = await request('/api/auth/login', { body: { email: staffEmail, password: 'audit-staff-pass-123' } })
      const anotherEvent = await request('/api/events', { token: org, body: {
        title: `Another live event ${suffix}`, venue_name: 'Other Hall', start_time: '2030-11-21T18:00:00+05:00', capacity: 10,
      } })
      await request(`/api/events/${anotherEvent.id}/staff`, { token: org, body: { mode: 'assign', email: staffEmail } })
      const clickStaffAction = () => browser.evaluate(`(() => {
        const row = [...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes(${JSON.stringify(staffEmail)}));
        row.querySelector('button').click();
      })()`)
      await clickStaffAction()
      await browser.wait('Revoke event access?')
      await browser.click('Confirm revoke')
      await browser.wait('Restore access')
      const afterRevoke = await request('/api/staff/events', { token: uiStaff.token })
      assert.deepEqual(afterRevoke.map((item) => item.id), [anotherEvent.id])
      await clickStaffAction()
      await browser.wait('Access to this event restored')
      const afterRestore = await request('/api/staff/events', { token: uiStaff.token })
      assert.deepEqual(new Set(afterRestore.map((item) => item.id)), new Set([event.id, anotherEvent.id]))
      await browser.navigate(`/support/${support.id}`)
      await browser.wait('Manage request')
      await browser.click('Assign to me')
      await browser.wait('Request assigned to you.')
      assert.equal((await request(`/api/support/cases/${support.id}`, { token: org })).assigned_to, organizer.user?.id ?? organizer.id)
      await browser.evaluate(`(() => {
        const input = document.querySelector('#support-status');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'waiting_customer');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await browser.click('Save status')
      await browser.wait('Status updated.')
      assert.equal((await request(`/api/support/cases/${support.id}`, { token: attendee.token })).status, 'waiting_customer')
      await request(`/api/support/cases/${support.id}/messages`, { token: attendee.token, body: { message: 'Additional payment details from attendee' } })
      await browser.click('Refresh request')
      await eventually(() => browser.evaluate(`document.querySelector('[data-support-status]').textContent === 'In progress'`), 'customer reply reopens waiting case')
      await browser.click('Escalate to platform support')
      await browser.wait('The platform team will receive')
      await browser.click('Confirm escalation')
      await browser.wait('Request escalated to platform support.')
      assert.equal((await request(`/api/support/cases/${support.id}`, { token: org })).escalated, true)
      await browser.navigate(`/organizer/events/${event.id}/support?status=in_progress&escalated=true`)
      await browser.wait('Attendee: Audit Attendee')
      assert.equal(await browser.evaluate('document.querySelectorAll(".support-case-card").length'), 1)
      await browser.navigate(`/support/new?event_id=${event.id}`)
      await browser.wait('An order is not required')
      await browser.evaluate(`(() => {
        const category = document.querySelector('#support-category');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(category, 'activation');
        category.dispatchEvent(new Event('change', { bubbles: true }));
        const message = document.querySelector('#support-message');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(message, 'Organizer activation inquiry from live UI');
        message.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await browser.click('Send request')
      await browser.wait('Platform support request')
      await browser.wait('Organizer activation inquiry from live UI')
      assert.equal(await browser.has('Manage request'), false)
      const platformCases = await request('/api/support/cases?kind=organizer', { token: org })
      assert.ok(platformCases.some(item => item.category === 'activation' && item.event_id === event.id))
      const firstHistory = await request(`/api/events/${event.id}/timeline?limit=2`, { token: org })
      assert.equal(firstHistory.length, 2)
      const lastHistory = firstHistory.at(-1)
      const historyQuery = new URLSearchParams({ limit: '2', before: `${lastHistory.timestamp}|${lastHistory.id}` })
      const nextHistory = await request(`/api/events/${event.id}/timeline?${historyQuery}`, { token: org })
      assert.equal(new Set([...firstHistory, ...nextHistory].map((record) => record.id)).size, 4)
      await browser.navigate(`/organizer/events/${event.id}/history`)
      await browser.wait('activity records loaded')
      assert.ok(await browser.has('Staff access revoked'))
      assert.ok(await browser.has('Order confirmed'))
      assert.ok(await browser.has('Support status changed'))
      assert.ok(await browser.has('Support case escalated'))
      await browser.evaluate(`(() => {
        const input = document.querySelector('select[name="action"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'staff_revoked');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await browser.click('Apply filters')
      await eventually(() => browser.evaluate(`document.querySelectorAll('.org-history-entry').length === 1 && document.querySelector('.org-history h3').textContent === 'Staff access revoked'`), 'filtered staff history')
      await request(`/api/events/${event.id}/cancel`, { token: org, method: 'POST' })
      await browser.navigate(`/organizer/events/${event.id}/history`)
      await browser.wait('Event cancelled')
      assert.ok(await browser.has('Staff access revoked'))
      assert.ok(await browser.has('Order confirmed'))
      assert.equal(await browser.evaluate(`document.querySelectorAll('.org-history button, .org-history input, .org-history textarea').length`), 0)
      await browser.navigate('/notifications')
      await browser.wait('Support case assigned to you')
      await browser.click('Mark all notifications as read')
      await browser.wait('notifications marked as read.')
      assert.equal((await request('/api/notifications?unread_only=true', { token: org })).length, 0)
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.calendarFile = null; const create = URL.createObjectURL; URL.createObjectURL = function(blob) { window.calendarFile = blob; return create.call(URL, blob) }; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { if (!this.download) click.call(this) };` })
      await browser.evaluate(`localStorage.setItem('biletflow_token', ${JSON.stringify(attendee.token)})`)
      await browser.navigate('/my-tickets')
      await browser.wait('Download calendar cancellation (.ics)')
      await browser.click('Download calendar cancellation (.ics)')
      await browser.wait('Calendar file prepared.')
      const calendar = await browser.evaluate('window.calendarFile.text()')
      assert.ok(calendar.includes(`UID:${event.id}@biletflow`))
      assert.ok(calendar.includes('STATUS:CANCELLED'))
      console.log('Live purchase, support, History, notifications and cancelled-event calendar verified on the isolated database.')
    } finally {
      browser.socket?.close()
      child.kill()
      await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve))
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 })
    }
  })
