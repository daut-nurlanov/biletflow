import { analyticsFixture } from './analytics.fixture.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chrome =
  process.env.CHROME_BIN ||
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function eventually(check, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}

class Browser {
  sequence = 0
  pending = new Map()
  events = new Map()
  async connect(url) {
    this.socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const call = this.pending.get(message.id)
        if (!call) return
        this.pending.delete(message.id)
        clearTimeout(call.timeout)
        if (message.error) call.reject(new Error(message.error.message))
        else call.resolve(message.result)
      } else this.events.get(message.method)?.(message.params)
    })
  }
  send(method, params = {}) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 10_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  async navigate(path) {
    await this.send('Page.navigate', { url: base + path })
  }
  async has(text) {
    return this.evaluate(
      `(document.body?.innerText ?? '').includes(${JSON.stringify(text)})`,
    )
  }
  async wait(text) {
    try {
      await eventually(() => this.has(text), text)
    } catch (error) {
      throw new Error(
        `${error.message}\n${await this.evaluate("document.body?.innerText ?? ''")}`,
        { cause: error },
      )
    }
  }
  async click(text) {
    await this.evaluate(`(() => {
      const element = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')].find(el => el.textContent.trim() === ${JSON.stringify(text)});
      if (!element) throw new Error('Element not found');
      element.click();
    })()`)
  }
}

test(
  'organizer access, filters, order actions and recovery',
  { skip: !chrome, timeout: 120_000 },
  async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-browser-'))
    const processChrome = spawn(
      chrome,
      [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    )
    const browser = new Browser()
    let stderr = ''
    processChrome.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    try {
      await eventually(
        () => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr),
        'Chrome startup',
      )
      const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1]
      const address = new URL(endpoint)
      const targets = await fetch(`http://${address.host}/json/list`).then(
        (response) => response.json(),
      )
      await browser.connect(
        targets.find((target) => target.type === 'page').webSocketDebuggerUrl,
      )
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      const user = {
        id: 'org-1',
        email: 'org@example.com',
        full_name: 'Organizer',
        role: 'organizer',
      }
      const event = {
        id: 'event-1',
        organizer_id: 'org-1',
        title: 'Test concert',
        start_time: '2030-01-01T19:00:00+05:00',
        venue_name: 'Test venue',
        venue_address: null,
        phase: 'upcoming',
        status: 'upcoming',
        capacity: 100,
        tickets_total: 10,
        tickets_sold: 2,
        tickets_checked_in: 0,
        net_revenue: '2000',
        is_paid_sales_active: true,
      }
      const ticket = {
        id: 'ticket-1',
        attendee_name: 'Dana',
        ticket_type_name: 'Standard',
        status: 'valid',
        section: null,
        row_label: null,
        seat_number: null,
      }
      let order = {
        id: 'order-1',
        event_id: event.id,
        total_amount: '2000',
        status: 'paid',
        created_at: '2030-01-01T10:00:00Z',
        promo_code_applied: null,
        tickets: [ticket],
        refunds: [],
      }
      let role = 'organizer'
      let outage = false
      let rejectRefund = false
      let refundUnavailable = false
      let meDelay = 0
      let analyticsError = false
      let expired = false
      let empty = false
      const requests = []
      const mutations = []
      const interceptErrors = []
      browser.events.set('Fetch.requestPaused', (params) => {
        void (async () => {
          const { requestId, request } = params
          const url = new URL(request.url)
          requests.push({ url: request.url, headers: request.headers })
          let status = 200
          let body
          if (request.method === 'OPTIONS') status = 204
          else if (url.pathname === '/api/auth/me') {
            await pause(meDelay)
            if (expired) {
              status = 401
              body = { detail: 'Session expired' }
            } else body = { ...user, role }
          } else if (url.pathname === '/api/auth/login')
            body = { ...user, role, token: 'test-session' }
          else if (url.pathname === '/api/organizer/events') {
            if (outage) {
              status = 503
              body = { detail: 'Temporary error' }
            } else
              body = empty
                ? []
                : [
                    event,
                    {
                      ...event,
                      id: 'event-2',
                      title: 'Past event',
                      phase: 'completed',
                    },
                  ]
          } else if (url.pathname.endsWith('/ticket-types'))
            body = [
              { id: 'type-1', name: 'Standard' },
              { id: 'type-2', name: 'VIP' },
            ]
          else if (url.pathname.endsWith('/analytics')) {
            if (analyticsError) {
              status = 503
              body = { detail: 'Analytics unavailable' }
            } else body = analyticsFixture(url.searchParams)
          } else if (url.pathname.endsWith('/attendees'))
            body = [
              {
                ...ticket,
                ticket_id: ticket.id,
                email: 'dana@example.com',
                ticket_type: 'Standard',
                order_id: order.id,
                checked_in_at: null,
              },
            ]
          else if (url.pathname.endsWith('/orders'))
            body = [
              {
                ...order,
                full_name: 'Dana',
                email: 'dana@example.com',
                ticket_count: 1,
              },
            ]
          else if (url.pathname === '/api/orders/order-1') body = order
          else if (
            url.pathname.endsWith('/refund') ||
            url.pathname.endsWith('/cancel')
          ) {
            mutations.push(request)
            if (refundUnavailable) {
              status = 503
              body = { detail: 'Refund response unavailable' }
            } else if (rejectRefund) {
              status = 409
              body = {
                detail:
                  'Some tickets were already used at the door, so the order cannot be refunded',
              }
            } else {
              await pause(150)
              const refunded = url.pathname.endsWith('/refund')
              order = {
                ...order,
                status: refunded ? 'refunded' : 'cancelled',
                tickets: [
                  { ...ticket, status: refunded ? 'refunded' : 'cancelled' },
                ],
                refunds: refunded
                  ? [
                      {
                        id: 'refund-1',
                        amount: '2000',
                        reason: 'Test refund',
                        created_at: order.created_at,
                      },
                    ]
                  : [],
              }
              body = order
            }
          } else {
            status = 404
            body = { detail: 'Not found' }
          }
          await browser.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: status,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Access-Control-Allow-Origin', value: '*' },
              { name: 'Access-Control-Allow-Headers', value: '*' },
              {
                name: 'Access-Control-Allow-Methods',
                value: 'GET, POST, OPTIONS',
              },
            ],
            body: Buffer.from(JSON.stringify(body ?? {})).toString('base64'),
          })
        })().catch((error) => {
          // Aborted requests lose their interception ID during navigation.
          if (!error.message.includes('Invalid InterceptionId'))
            interceptErrors.push(error)
        })
      })
      await browser.send('Fetch.enable', {
        patterns: [
          { urlPattern: '*localhost:8000/*' },
          { urlPattern: '*127.0.0.1:8000/*' },
        ],
      })
      await browser.navigate('/login')
      await browser.wait('Sign in')

      await t.test(
        'anonymous direct link returns to requested page after login',
        async () => {
          await browser.evaluate('localStorage.clear()')
          await browser.navigate('/organizer/events/event-1/orders')
          await eventually(() => browser.evaluate("location.pathname === '/login' && !!document.querySelector('form input[type=email]')"), 'Login form')
          await browser.evaluate(`(() => {
            for (const [type, value] of [['email', 'organizer@example.com'], ['password', 'test-password']]) {
              const field = document.querySelector('form input[type=' + type + ']')
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value)
              field.dispatchEvent(new Event('input', { bubbles: true }))
            }
          })()`)
          await browser.click('Sign in')
          await browser.wait('Orders')
          await browser.wait('Dana')
          assert.equal(
            await browser.evaluate('location.pathname'),
            '/organizer/events/event-1/orders',
          )
          assert.ok(
            requests.some(
              (request) =>
                request.url.endsWith('/orders') &&
                request.headers.Authorization === 'Bearer test-session',
            ),
          )
        },
      )
      await t.test(
        'session restoration waits instead of redirecting to login',
        async () => {
          meDelay = 400
          await browser.navigate('/organizer')
          await browser.wait('Restoring your session')
          assert.equal(
            await browser.evaluate('location.pathname'),
            '/organizer',
          )
          await browser.wait('Test concert')
          meDelay = 0
        },
      )
      await t.test('phase filter selects completed events', async () => {
        await browser.navigate('/organizer?phase=completed')
        await browser.wait('Past event')
        assert.equal(await browser.has('Test concert'), false)
      })
      await t.test(
        'attendee filters are sent to server and persist in URL',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/attendees?q=dana&status=valid&ticket_type_id=type-1',
          )
          await browser.wait('dana@example.com')
          assert.ok(
            requests.some((request) =>
              request.url.includes(
                '/attendees?q=dana&status=valid&ticket_type_id=type-1',
              ),
            ),
          )
          await eventually(
            () =>
              browser.evaluate(
                `document.querySelector('select[name="ticket_type_id"]').value === 'type-1'`,
              ),
            'selected ticket type',
          )
          await browser.click('View order')
          await browser.wait('Order tickets')
        },
      )
      await t.test(
        'an uncertain refund requires a fresh read before retry',
        async () => {
          refundUnavailable = true
          await browser.click('Refund payment…')
          await browser.click('Confirm refund')
          await browser.wait('The server may have completed the request.')
          assert.equal(await browser.has('Confirm refund'), false)
          assert.equal(await browser.has('Refund payment…'), false)
          refundUnavailable = false
          await browser.click('Refresh status')
          await browser.wait('Refund payment…')
        },
      )
      await t.test(
        'server refusal retains confirmation and shows explanation',
        async () => {
          rejectRefund = true
          await browser.click('Refund payment…')
          await browser.click('Confirm refund')
          await browser.wait('Tickets in this order have already been used')
          assert.equal(order.status, 'paid')
          rejectRefund = false
        },
      )
      await t.test(
        'refund confirms amount, blocks duplicate submission and refreshes status',
        async () => {
          const before = mutations.length
          await browser.evaluate(
            `(() => { const form = document.querySelector('.org-confirm form'); form.requestSubmit(); form.requestSubmit(); })()`,
          )
          await browser.wait('Simulated refund completed')
          await browser.wait('Refund history')
          assert.equal(mutations.length - before, 1)
          assert.equal(order.status, 'refunded')
          assert.equal(await browser.has('Refund payment…'), false)
        },
      )
      await t.test('used tickets have no refund action', async () => {
        order = {
          ...order,
          status: 'paid',
          tickets: [{ ...ticket, status: 'checked_in' }],
          refunds: [],
        }
        await browser.navigate('/organizer/events/event-1/orders/order-1')
        await browser.wait('Refunds and cancellations are unavailable')
        assert.equal(await browser.has('Refund payment…'), false)
      })
      await t.test('free orders use cancel endpoint', async () => {
        order = {
          ...order,
          status: 'paid',
          total_amount: '0',
          tickets: [ticket],
          refunds: [],
        }
        await browser.navigate('/organizer/events/event-1/orders/order-1')
        await browser.wait('Cancel registration…')
        await browser.click('Cancel registration…')
        await browser.click('Confirm cancellation')
        await browser.wait('Free registration cancelled')
        assert.ok(mutations.at(-1).url.endsWith('/cancel'))
      })
      await t.test(
        'foreign event and mismatched order are not displayed',
        async () => {
          await browser.navigate('/organizer/events/foreign/orders')
          await browser.wait('Event not found')
          assert.equal(await browser.has('dana@example.com'), false)
          order = { ...order, event_id: 'foreign' }
          await browser.navigate('/organizer/events/event-1/orders/order-1')
          await browser.wait('This order belongs to a different event')
          assert.equal(await browser.has('Order tickets'), false)
        },
      )
      await t.test(
        'analytics renders reconciled figures and accessible daily values',
        async () => {
          await browser.navigate('/organizer/events/event-1/analytics')
          await browser.wait('Revenue for selected purchases')
          await browser.wait('SPRING')
          assert.ok(
            await browser.evaluate(
              `document.querySelector('svg[role="img"] title').textContent.includes('revenue')`,
            ),
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('table caption').textContent === 'Daily sales'`,
            ),
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[aria-labelledby="revenue-title"]').textContent.includes('7,200')`,
            ),
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[aria-labelledby="inventory-title"]').textContent.includes('24')`,
            ),
          )
          if (process.env.TEST_ANALYTICS_SCREENSHOT) {
            const screenshot = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: true,
            })
            await writeFile(
              process.env.TEST_ANALYTICS_SCREENSHOT,
              Buffer.from(screenshot.data, 'base64'),
            )
          }
        },
      )
      await t.test(
        'analytics filters persist across reload and are sent to the server',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/analytics?date_from=2029-04-10&date_to=2029-04-12&ticket_type_id=type-2',
          )
          await browser.wait('Campaign performance')
          await eventually(
            () =>
              browser.evaluate(
                `document.querySelector('select[name="ticket_type_id"]').value === 'type-2'`,
              ),
            'analytics selected type',
          )
          assert.equal(
            await browser.evaluate(
              `document.querySelector('input[name="date_from"]').value`,
            ),
            '2029-04-10',
          )
          assert.equal(
            await browser.evaluate(
              `document.querySelector('input[name="date_to"]').value`,
            ),
            '2029-04-12',
          )
          assert.ok(
            requests.some((request) =>
              request.url.includes(
                '/analytics?date_from=2029-04-10&date_to=2029-04-12&ticket_type_id=type-2',
              ),
            ),
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[aria-labelledby="revenue-title"]').textContent.includes('4,500')`,
            ),
          )
          await browser.evaluate(`(() => {
            const input = document.querySelector('input[name="date_from"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2029-04-11');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`)
          await browser.click('Apply filters')
          await eventually(
            () =>
              browser.evaluate(
                `new URLSearchParams(location.search).get('date_from') === '2029-04-11'`,
              ),
            'submitted analytics date',
          )
          await browser.wait('Campaign performance')
          await browser.click('Reset filters')
          await browser.wait('Campaign performance')
          assert.equal(await browser.evaluate('location.search'), '')
        },
      )
      await t.test(
        'invalid date range avoids analytics requests and can be reset',
        async () => {
          await eventually(
            () => browser.evaluate("!!document.querySelector('[aria-labelledby=revenue-title]')"),
            'Previous analytics refresh finished',
          )
          const before = requests.filter((request) =>
            request.url.includes('/analytics'),
          ).length
          await browser.navigate(
            '/organizer/events/event-1/analytics?date_from=2029-04-12&date_to=2029-04-10',
          )
          await browser.wait('The start date must not be after the end date')
          assert.equal(
            requests.filter((request) => request.url.includes('/analytics'))
              .length,
            before,
          )
          await browser.click('Reset filters')
          await browser.wait('Campaign performance')
        },
      )
      await t.test(
        'empty analytics retains current inventory without showing a misleading graph',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/analytics?date_from=2099-01-01',
          )
          await browser.wait('No confirmed orders in this selection')
          assert.equal(
            await browser.evaluate(
              `document.querySelectorAll('svg[role="img"]').length`,
            ),
            0,
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[aria-labelledby="inventory-title"]').textContent.includes('24')`,
            ),
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[aria-labelledby="revenue-title"]').textContent.includes('KZT')`,
            ),
          )
        },
      )
      await t.test(
        'free registrations show daily ticket counts without a paid-revenue graph',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/analytics?ticket_type_id=type-free',
          )
          await browser.wait(
            'Confirmed orders in this selection have no paid revenue',
          )
          assert.equal(
            await browser.evaluate(
              `document.querySelectorAll('svg[role="img"]').length`,
            ),
            0,
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('table caption').textContent === 'Daily sales'`,
            ),
          )
          assert.ok(await browser.has('Free admission'))
        },
      )
      await t.test(
        'analytics failure offers retry without changing filters',
        async () => {
          analyticsError = true
          await browser.navigate(
            '/organizer/events/event-1/analytics?ticket_type_id=type-2',
          )
          await browser.wait('Analytics unavailable')
          analyticsError = false
          await browser.click('Retry')
          await browser.wait('Campaign performance')
          assert.equal(
            await browser.evaluate('location.search'),
            '?ticket_type_id=type-2',
          )
        },
      )
      await t.test('load error can be retried', async () => {
        outage = true
        await browser.navigate('/organizer')
        await browser.wait('Temporary error')
        outage = false
        await browser.click('Retry')
        await browser.wait('Test concert')
      })
      await t.test('empty event list explains absence of data', async () => {
        empty = true
        await browser.navigate('/organizer')
        await browser.wait('No events to show')
        empty = false
      })
      await t.test(
        'mobile layout has no page-level horizontal overflow',
        async () => {
          await browser.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
          })
          await browser.navigate('/organizer/events/event-1/attendees')
          await browser.wait('dana@example.com')
          assert.equal(
            await browser.evaluate(
              'document.documentElement.scrollWidth <= innerWidth',
            ),
            true,
          )
          assert.doesNotMatch(
            await browser.evaluate('document.body.innerText'),
            /[А-Яа-яЁё]/u,
          )
          if (process.env.TEST_SCREENSHOT) {
            const screenshot = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: true,
            })
            await writeFile(
              process.env.TEST_SCREENSHOT,
              Buffer.from(screenshot.data, 'base64'),
            )
          }
        },
      )
      await t.test(
        'analytics remains usable on mobile with readable chart labels',
        async () => {
          await browser.navigate('/organizer/events/event-1/analytics')
          await browser.wait('Campaign performance')
          assert.equal(
            await browser.evaluate(
              'document.documentElement.scrollWidth <= innerWidth',
            ),
            true,
          )
          assert.ok(
            await browser.evaluate(
              `document.querySelector('.org-sales-chart svg').getBoundingClientRect().width >= 640`,
            ),
          )
          if (process.env.TEST_ANALYTICS_MOBILE_SCREENSHOT) {
            const screenshot = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: true,
            })
            await writeFile(
              process.env.TEST_ANALYTICS_MOBILE_SCREENSHOT,
              Buffer.from(screenshot.data, 'base64'),
            )
          }
        },
      )
      await t.test('attendee role cannot load organizer APIs', async () => {
        role = 'attendee'
        const before = requests.filter((request) =>
          request.url.includes('/api/organizer'),
        ).length
        await browser.navigate('/organizer')
        await browser.wait('This dashboard is only available to organizers')
        assert.equal(
          requests.filter((request) => request.url.includes('/api/organizer'))
            .length,
          before,
        )
      })
      await t.test(
        'expired session clears token and returns to login',
        async () => {
          expired = true
          await browser.navigate('/organizer')
          await eventually(
            () =>
              browser.evaluate(
                `location.pathname === '/login' && document.querySelector('h1')?.textContent === 'Sign in'`,
              ),
            'expired-session redirect to sign-in page',
          )
          assert.equal(
            await browser.evaluate('localStorage.getItem("biletflow_token")'),
            null,
          )
          assert.equal(await browser.evaluate('location.pathname'), '/login')
        },
      )
      assert.deepEqual(interceptErrors, [])
    } finally {
      browser.socket?.close()
      processChrome.kill()
      await new Promise((resolve) =>
        processChrome.exitCode !== null
          ? resolve()
          : processChrome.once('exit', resolve),
      )
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 150,
      })
    }
  },
)
