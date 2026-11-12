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
      `document.body.innerText.includes(${JSON.stringify(text)})`,
    )
  }
  async wait(text) {
    try {
      await eventually(() => this.has(text), text)
    } catch (error) {
      throw new Error(
        `${error.message}\n${await this.evaluate('document.body.innerText')}`,
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
      { stdio: ['ignore', 'ignore', 'pipe'] },
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
        full_name: 'Организатор',
        role: 'organizer',
      }
      const event = {
        id: 'event-1',
        organizer_id: 'org-1',
        title: 'Тестовый концерт',
        start_time: '2030-01-01T19:00:00+05:00',
        venue_name: 'Тестовый зал',
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
        attendee_name: 'Дана',
        ticket_type_name: 'Стандарт',
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
      let meDelay = 0
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
              body = { detail: 'Временная ошибка' }
            } else
              body = empty
                ? []
                : [
                    event,
                    {
                      ...event,
                      id: 'event-2',
                      title: 'Архивное событие',
                      phase: 'completed',
                    },
                  ]
          } else if (url.pathname.endsWith('/ticket-types'))
            body = [{ id: 'type-1', name: 'Стандарт' }]
          else if (url.pathname.endsWith('/attendees'))
            body = [
              {
                ...ticket,
                ticket_id: ticket.id,
                email: 'dana@example.com',
                ticket_type: 'Стандарт',
                order_id: order.id,
                checked_in_at: null,
              },
            ]
          else if (url.pathname.endsWith('/orders'))
            body = [
              {
                ...order,
                full_name: 'Дана',
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
            if (rejectRefund) {
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
                        reason: 'Тестовый возврат',
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
        })().catch((error) => interceptErrors.push(error))
      })
      await browser.send('Fetch.enable', {
        patterns: [{ urlPattern: '*localhost:8000/*' }],
      })
      await browser.navigate('/login')
      await browser.wait('Вход')

      await t.test(
        'anonymous direct link returns to requested page after login',
        async () => {
          await browser.evaluate('localStorage.clear()')
          await browser.navigate('/organizer/events/event-1/orders')
          await browser.wait('Вход')
          await browser.click('Войти')
          await browser.wait('Заказы')
          await browser.wait('Дана')
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
          await browser.wait('Проверяем вход')
          assert.equal(
            await browser.evaluate('location.pathname'),
            '/organizer',
          )
          await browser.wait('Тестовый концерт')
          meDelay = 0
        },
      )
      await t.test('phase filter selects completed events', async () => {
        await browser.navigate('/organizer?phase=completed')
        await browser.wait('Архивное событие')
        assert.equal(await browser.has('Тестовый концерт'), false)
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
          await browser.click('Открыть заказ')
          await browser.wait('Билеты заказа')
        },
      )
      await t.test(
        'server refusal retains confirmation and shows explanation',
        async () => {
          rejectRefund = true
          await browser.click('Вернуть оплату…')
          await browser.click('Подтвердить возврат')
          await browser.wait('По этому заказу уже прошли')
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
          await browser.wait('Симулированный возврат оформлен')
          await browser.wait('Оформленные возвраты')
          assert.equal(mutations.length - before, 1)
          assert.equal(order.status, 'refunded')
          assert.equal(await browser.has('Вернуть оплату…'), false)
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
        await browser.wait('Возврат и отмена недоступны')
        assert.equal(await browser.has('Вернуть оплату…'), false)
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
        await browser.wait('Отменить регистрацию…')
        await browser.click('Отменить регистрацию…')
        await browser.click('Подтвердить отмену')
        await browser.wait('Бесплатная регистрация отменена')
        assert.ok(mutations.at(-1).url.endsWith('/cancel'))
      })
      await t.test(
        'foreign event and mismatched order are not displayed',
        async () => {
          await browser.navigate('/organizer/events/foreign/orders')
          await browser.wait('Мероприятие не найдено')
          assert.equal(await browser.has('dana@example.com'), false)
          order = { ...order, event_id: 'foreign' }
          await browser.navigate('/organizer/events/event-1/orders/order-1')
          await browser.wait('Этот заказ относится к другому мероприятию')
          assert.equal(await browser.has('Билеты заказа'), false)
        },
      )
      await t.test('load error can be retried', async () => {
        outage = true
        await browser.navigate('/organizer')
        await browser.wait('Временная ошибка')
        outage = false
        await browser.click('Повторить')
        await browser.wait('Тестовый концерт')
      })
      await t.test('empty event list explains absence of data', async () => {
        empty = true
        await browser.navigate('/organizer')
        await browser.wait('Здесь пока нет мероприятий')
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
      await t.test('attendee role cannot load organizer APIs', async () => {
        role = 'attendee'
        const before = requests.filter((request) =>
          request.url.includes('/api/organizer'),
        ).length
        await browser.navigate('/organizer')
        await browser.wait('Кабинет доступен организаторам')
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
          await browser.wait('Вход')
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
