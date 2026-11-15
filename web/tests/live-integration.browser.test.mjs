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

test('live Docker: organizer campaign -> browser paid/free purchase -> QR -> staff admission',
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
      body: { contact_phone: 'demo contact', payout_account_details: 'Simulated payout account' } })
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
      console.log('Live free/paid orders, campaign discount, HTTP scanner workflow and QR images verified; audit records retained in isolated database.')
    } finally {
      browser.socket?.close()
      child.kill()
      await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve))
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 })
    }
  })
