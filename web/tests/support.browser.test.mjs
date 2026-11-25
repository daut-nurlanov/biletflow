import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Browser, eventually, pause } from './browser-helper.mjs'

const chrome =
  process.env.CHROME_BIN ||
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(existsSync)

test(
  'organizer support filters, management, replies and role boundaries',
  { skip: !chrome, timeout: 120_000 },
  async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-support-'))
    const child = spawn(
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
    child.stderr.on('data', (data) => {
      stderr += data
    })
    const errors = [],
      requests = [],
      writes = []
    let role = 'organizer',
      detailError = false,
      listError = false,
      failWrite = false,
      slowResolved = false,
      slowFirstDetail = false
    const user = () => ({
      id: role === 'organizer' ? 'org-1' : 'buyer-1',
      full_name: 'Support User',
      role,
    })
    const eventId = '10000000-0000-0000-0000-000000000001'
    const cases = [
      {
        id: 'case-1',
        opened_by: 'buyer-1',
        opened_by_name: 'Buyer One',
        event_id: eventId,
        event_title: 'Completed support event',
        category: 'refund',
        status: 'open',
        kind: 'attendee',
        escalated: false,
        assigned_to: null,
        created_at: '2029-04-10T10:00:00Z',
        updated_at: '2029-04-10T10:00:00Z',
        order_id: 'order-1',
        ticket_id: 'ticket-1',
        messages: [
          {
            id: 'msg-1',
            sender_id: 'buyer-1',
            sender_name: 'Buyer One',
            message: '<img src=x onerror="window.supportInjected=true">',
            created_at: '2029-04-10T10:00:00Z',
          },
        ],
      },
      {
        id: 'case-2',
        opened_by: 'org-1',
        opened_by_name: 'Support User',
        event_id: eventId,
        event_title: 'Completed support event',
        category: 'activation',
        status: 'in_progress',
        kind: 'organizer',
        escalated: false,
        assigned_to: 'admin-1',
        assigned_to_name: 'Platform Admin',
        created_at: '2029-04-10T10:00:00Z',
        updated_at: '2029-04-10T10:00:00Z',
        messages: [],
      },
    ]
    async function field(selector, value) {
      await browser.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    }
    async function noOverflow() {
      assert.equal(
        await browser.evaluate(
          'document.documentElement.scrollWidth <= innerWidth',
        ),
        true,
      )
    }
    try {
      await eventually(
        () => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr),
        'Chrome startup',
      )
      const address = new URL(
        stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1],
      )
      const targets = await fetch(`http://${address.host}/json/list`).then(
        (response) => response.json(),
      )
      await browser.connect(
        targets.find((target) => target.type === 'page').webSocketDebuggerUrl,
      )
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      browser.events.set('Fetch.requestPaused', ({ requestId, request }) => {
        void (async () => {
          requests.push(request)
          const url = new URL(request.url),
            path = url.pathname
          let status = 200,
            body = {}
          if (request.method === 'OPTIONS') status = 204
          else if (path === '/api/auth/me') body = user()
          else if (path === '/api/organizer/events')
            body = [
              {
                id: eventId,
                title: 'Completed support event',
                phase: 'completed',
                venue_name: 'Hall',
                start_time: '2029-04-01T19:00:00+05:00',
              },
            ]
          else if (path === '/api/support/cases' && request.method === 'GET') {
            if (slowResolved && url.searchParams.get('status') === 'resolved')
              await pause(500)
            if (listError) {
              status = 503
              body = { detail: 'Support inbox unavailable' }
            } else
              body = cases.filter(
                (item) =>
                  ['status', 'event_id', 'kind'].every(
                    (key) =>
                      !url.searchParams.get(key) ||
                      url.searchParams.get(key) === item[key],
                  ) &&
                  (!url.searchParams.get('escalated') ||
                    url.searchParams.get('escalated') ===
                      String(item.escalated)),
              )
          } else if (
            path === '/api/support/cases' &&
            request.method === 'POST'
          ) {
            const input = JSON.parse(request.postData)
            writes.push({ path, method: request.method, body: input })
            body = cases[1]
            status = 201
          } else if (path.startsWith('/api/support/cases/')) {
            const id = path.split('/')[4],
              item = cases.find((item) => item.id === id)
            if (!item) {
              status = 404
              body = { detail: 'Support case not found' }
            } else if (request.method === 'GET') {
              const snapshot = {
                ...item,
                messages: [...item.messages],
                your_role_in_case:
                  item.opened_by === user().id ? 'owner' : 'handler',
              }
              if (slowFirstDetail && id === 'case-1') await pause(500)
              if (detailError) {
                status = 503
                body = { detail: 'Conversation unavailable' }
              } else body = snapshot
            } else {
              const input = request.postData
                ? JSON.parse(request.postData)
                : undefined
              writes.push({ path, method: request.method, body: input })
              await pause(150)
              if (failWrite) {
                status = 409
                body = { detail: 'Support update rejected' }
              } else if (path.endsWith('/messages')) {
                body = {
                  id: `msg-${writes.length}`,
                  sender_id: user().id,
                  message: input.message,
                  created_at: '2029-04-10T11:00:00Z',
                }
                item.messages.push(body)
                status = 201
              } else if (path.endsWith('/escalate')) {
                item.escalated = true
                body = item
              } else {
                Object.assign(item, input)
                body = item
              }
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
                value: 'GET,POST,PUT,OPTIONS',
              },
            ],
            body: Buffer.from(JSON.stringify(body)).toString('base64'),
          })
        })().catch((error) => {
          if (!error.message.includes('Invalid InterceptionId'))
            errors.push(error)
        })
      })
      await browser.send('Fetch.enable', {
        patterns: [{ urlPattern: '*localhost:8000/*' }],
      })
      await browser.navigate('/login')
      await browser.wait('Sign in')
      await browser.evaluate(
        'localStorage.setItem("biletflow_token", "support-test-token")',
      )

      await t.test(
        'event inbox is scoped to attendee cases and keeps filters on reload',
        async () => {
          await browser.navigate(`/organizer/events/${eventId}/support`)
          await browser.wait('Buyer One')
          assert.equal(await browser.has('Your platform request'), false)
          const req = requests
            .filter(
              (item) => new URL(item.url).pathname === '/api/support/cases',
            )
            .at(-1)
          assert.equal(new URL(req.url).searchParams.get('event_id'), eventId)
          assert.equal(new URL(req.url).searchParams.get('kind'), 'attendee')
          await field('select[name=status]', 'open')
          await field('select[name=escalated]', 'false')
          await browser.click('Apply filters')
          await browser.wait('Buyer One')
          assert.equal(
            await browser.evaluate(
              'new URL(location.href).searchParams.get("status")',
            ),
            'open',
          )
          await browser.navigate(
            `/organizer/events/${eventId}/support?status=open&escalated=false`,
          )
          await browser.wait('Buyer One')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("select[name=escalated]").value',
            ),
            'false',
          )
          await browser.evaluate(
            'document.querySelector(".support-case-card").click()',
          )
          await browser.wait('Manage request')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("main .support-back").getAttribute("href")',
            ),
            `/organizer/events/${eventId}/support?status=open&escalated=false`,
          )
        },
      )
      await t.test(
        'thread shows safe context and permits assignment only once',
        async () => {
          assert.ok(await browser.has('Order:'))
          assert.ok(await browser.has('ticket-1'))
          assert.equal(
            await browser.evaluate(
              'Boolean(window.supportInjected) || document.querySelector(".support-thread img") !== null',
            ),
            false,
          )
          const before = writes.length
          await browser.evaluate(
            '(() => { const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Assign to me"); button.click(); button.click(); })()',
          )
          await browser.wait('Request assigned to you.')
          assert.equal(writes.length - before, 1)
          assert.deepEqual(writes.at(-1).body, { assigned_to: 'org-1' })
          assert.ok(await browser.has('Assigned to: You'))
        },
      )
      await t.test(
        'status failure retains choice; double submission produces one successful update',
        async () => {
          failWrite = true
          await field('#support-status', 'waiting_customer')
          await browser.click('Save status')
          await browser.wait('Support update rejected')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-status").value',
            ),
            'waiting_customer',
          )
          assert.equal(cases[0].status, 'open')
          failWrite = false
          const before = writes.length
          await browser.evaluate(
            '(() => { const form = document.querySelector(".support-controls form"); form.requestSubmit(); form.requestSubmit(); })()',
          )
          await browser.wait('Status updated.')
          assert.equal(writes.length - before, 1)
          assert.equal(cases[0].status, 'waiting_customer')
          assert.deepEqual(writes.at(-1).body, { status: 'waiting_customer' })
        },
      )
      await t.test(
        'escalation requires confirmation and cannot be submitted twice',
        async () => {
          const before = writes.length
          await browser.click('Escalate to platform support')
          await browser.wait('The platform team will receive')
          await browser.click('Cancel escalation')
          assert.equal(writes.length, before)
          await browser.click('Escalate to platform support')
          await browser.evaluate(
            '(() => { const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Confirm escalation"); button.click(); button.click(); })()',
          )
          await browser.wait('Request escalated to platform support.')
          assert.equal(writes.length - before, 1)
          assert.equal(await browser.has('Confirm escalation'), false)
          assert.ok(writes.at(-1).path.endsWith('/escalate'))
        },
      )
      await t.test(
        'reply survives refresh, failed submission and status actions',
        async () => {
          await field('#support-reply', 'Draft support reply')
          await browser.click('Refresh request')
          await browser.wait('Manage request')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            'Draft support reply',
          )
          failWrite = true
          await browser.click('Send reply')
          await browser.wait('Support update rejected')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            'Draft support reply',
          )
          failWrite = false
          await browser.click('Send reply')
          await browser.wait('Reply sent.')
          await eventually(
            () =>
              browser.evaluate(
                'document.querySelector(".support-thread").textContent.includes("Draft support reply")',
              ),
            'reply appended',
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            '',
          )
        },
      )
      await t.test(
        'load failures disable management and retry preserves the reply draft',
        async () => {
          await field('#support-reply', 'Keep this draft')
          detailError = true
          await browser.click('Refresh request')
          await browser.wait('Conversation unavailable')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-status").disabled',
            ),
            true,
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").disabled',
            ),
            true,
          )
          detailError = false
          await browser.click('Retry request')
          await browser.wait('Manage request')
          await eventually(
            () =>
              browser.evaluate(
                '!document.querySelector("#support-reply").disabled',
              ),
            'recovered request',
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            'Keep this draft',
          )
        },
      )
      await t.test(
        'polling preserves the draft and a delayed read cannot overwrite a status update',
        async () => {
          cases[0].status = 'resolved'
          await pause(10_500)
          await eventually(
            () =>
              browser.evaluate(
                `document.querySelector('[data-support-status]').textContent === 'Resolved'`,
              ),
            'polled status',
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            'Keep this draft',
          )
          slowFirstDetail = true
          await browser.click('Refresh request')
          await pause(100)
          await field('#support-status', 'open')
          await browser.click('Save status')
          await browser.wait('Status updated.')
          await pause(700)
          assert.equal(
            await browser.evaluate(
              `document.querySelector('[data-support-status]').textContent`,
            ),
            'Open',
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector("#support-reply").value',
            ),
            'Keep this draft',
          )
          slowFirstDetail = false
        },
      )
      await t.test(
        'newer case navigation ignores an older delayed conversation',
        async () => {
          slowFirstDetail = true
          await browser.navigate('/support/case-1')
          await pause(120)
          await browser.evaluate(
            'history.pushState(null, "", "/support/case-2"); dispatchEvent(new PopStateEvent("popstate"))',
          )
          await browser.wait('Platform support request')
          await pause(650)
          assert.ok(await browser.has('Activation'))
          assert.equal(await browser.has('Manage request'), false)
          slowFirstDetail = false
        },
      )
      await t.test(
        'global list separates platform requests, supports empty/error/reset and stale filters',
        async () => {
          await browser.navigate('/support?kind=organizer')
          await browser.wait('Your platform request')
          assert.equal(await browser.has('Buyer One'), false)
          listError = true
          await browser.click('Refresh requests')
          await browser.wait('Support inbox unavailable')
          listError = false
          await browser.click('Retry requests')
          await browser.wait('Your platform request')
          slowResolved = true
          await field('select[name=status]', 'resolved')
          await browser.click('Apply filters')
          await field('select[name=status]', 'in_progress')
          await browser.click('Apply filters')
          await browser.wait('Your platform request')
          await pause(650)
          assert.ok(await browser.has('Your platform request'))
          slowResolved = false
          await field('select[name=status]', 'resolved')
          await browser.click('Apply filters')
          await browser.wait('No support requests match')
          await browser.click('Reset filters')
          await browser.wait('Buyer One')
          await field('select[name=kind]', 'organizer')
          await browser.click('Reset filters')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("select[name=kind]").value',
            ),
            '',
          )
        },
      )
      await t.test(
        'organizer can contact platform without fetching attendee orders',
        async () => {
          const before = requests.length
          await browser.click('Contact platform support')
          await browser.wait('An order is not required')
          assert.equal(
            await browser.evaluate('document.querySelector("#support-order")'),
            null,
          )
          await field('#support-category', 'activation')
          await field('#support-message', 'Paid sales activation question')
          await browser.click('Send request')
          await browser.wait('Platform support request')
          assert.equal(writes.at(-1).body.category, 'activation')
          assert.equal(writes.at(-1).body.order_id, undefined)
          assert.equal(
            requests
              .slice(before)
              .some(
                (item) =>
                  new URL(item.url).pathname === '/api/orders/my-orders',
              ),
            false,
          )
        },
      )
      await t.test(
        'mobile screens fit and a foreign event never loads its inbox',
        async () => {
          await browser.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
          })
          await browser.navigate('/support/case-1')
          await browser.wait('Manage request')
          await noOverflow()
          if (process.env.TEST_SUPPORT_SCREENSHOT) {
            const screenshot = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: true,
            })
            await writeFile(
              process.env.TEST_SUPPORT_SCREENSHOT,
              Buffer.from(screenshot.data, 'base64'),
            )
          }
          await browser.navigate(`/organizer/events/${eventId}/support`)
          await browser.wait('Buyer One')
          await noOverflow()
          const before = requests.length
          await browser.navigate('/organizer/events/foreign/support')
          await browser.wait('Event not found')
          assert.equal(
            requests
              .slice(before)
              .some(
                (item) => new URL(item.url).pathname === '/api/support/cases',
              ),
            false,
          )
        },
      )
      await t.test(
        'attendee can reply but cannot manage or escalate; missing cases hide previous contents',
        async () => {
          role = 'attendee'
          await browser.navigate('/support/case-1')
          await browser.wait('Attendee support request')
          assert.equal(await browser.has('Manage request'), false)
          assert.equal(await browser.has('Assign to me'), false)
          await field('#support-reply', 'Attendee reply')
          await browser.click('Send reply')
          await browser.wait('Reply sent.')
          await browser.navigate('/support/missing')
          await browser.wait('Request not found')
          assert.equal(await browser.has('Keep this draft'), false)
          assert.equal(await browser.has('Manage request'), false)
        },
      )
      assert.deepEqual(errors, [])
      assert.ok(
        requests
          .filter((item) => item.method !== 'OPTIONS')
          .every(
            (item) =>
              item.headers.Authorization === 'Bearer support-test-token',
          ),
      )
    } finally {
      browser.socket?.close()
      child.kill()
      await new Promise((resolve) =>
        child.exitCode !== null ? resolve() : child.once('exit', resolve),
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
