import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
test(
  'notifications, calendar files and admin failed payments',
  { skip: !chrome, timeout: 120000 },
  async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-utilities-'))
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
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data
    })
    const browser = new Browser(),
      requests = [],
      errors = []
    let role = 'attendee',
      failRead = false,
      failWrite = false,
      failCalendar = false,
      failPayments = false,
      emptyPayments = false,
      cancelled = false,
      account = 'user-1',
      expire = false
    const notices = [
      {
        id: 'n1',
        subject: 'Ticket confirmed',
        body: '<img src=x onerror="window.injected=true">\nYour ticket is ready.',
        kind: 'order_confirmation',
        is_read: false,
        created_at: '2030-01-01T10:00:00Z',
      },
      {
        id: 'n2',
        subject: 'Old message',
        body: 'Already seen',
        kind: 'support',
        is_read: true,
        created_at: '2029-01-01T10:00:00Z',
      },
    ]
    const writes = () =>
      requests.filter((r) => !['GET', 'OPTIONS'].includes(r.method))
    try {
      await eventually(
        () => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr),
        'Chrome',
      )
      const address = new URL(
        stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1],
      )
      const targets = await fetch(`http://${address.host}/json/list`).then(
        (r) => r.json(),
      )
      await browser.connect(
        targets.find((t) => t.type === 'page').webSocketDebuggerUrl,
      )
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      await browser.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.downloads=[];window.calendarBlobs=[];const originalURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.calendarBlobs.push(blob);return originalURL.call(URL,blob)};const anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.downloads.push(this.download);return}return anchorClick.call(this)};`,
      })
      browser.events.set('Fetch.requestPaused', ({ requestId, request }) => {
        void (async () => {
          requests.push(request)
          const url = new URL(request.url),
            path = url.pathname
          let status = 200,
            body = {},
            type = 'application/json'
          if (request.method === 'OPTIONS') status = 204
          else if (path === '/api/auth/me')
            body = { id: account, role, full_name: 'Utilities User' }
          else if (path === '/api/notifications') {
            if (failRead) {
              status = 503
              body = { detail: 'Notifications unavailable' }
            } else if (expire) {
              status = 401
              body = { detail: 'Expired' }
            } else
              body =
                account === 'user-1'
                  ? notices.filter(
                      (n) =>
                        url.searchParams.get('unread_only') !== 'true' ||
                        !n.is_read,
                    )
                  : []
          } else if (path === '/api/notifications/read-all') {
            await pause(150)
            if (failWrite) {
              status = 503
              body = { detail: 'Could not mark notifications' }
            } else {
              body = { marked_read: notices.filter((n) => !n.is_read).length }
              notices.forEach((n) => (n.is_read = true))
            }
          } else if (path === '/api/admin/payment-failures') {
            if (failPayments) {
              status = 403
              body = { detail: 'Admin access denied' }
            } else
              body = emptyPayments
                ? []
                : [
                    {
                      id: 'failed-order-1',
                      event_id: 'event-1',
                      event_title: 'Payment test event',
                      attendee_email: 'buyer@example.com',
                      total_amount: '1250.50',
                      payment_reference: null,
                      created_at: '2030-01-01T10:00:00Z',
                    },
                    {
                      id: 'failed-order-2',
                      event_id: 'event-1',
                      event_title: '<script>bad</script>',
                      attendee_email: 'other@example.com',
                      total_amount: '500',
                      payment_reference: 'FAILED-REFERENCE',
                      created_at: '2029-01-01T10:00:00Z',
                    },
                  ]
          } else if (path === '/api/events/event-1')
            body = {
              id: 'event-1',
              title: 'Calendar test event',
              venue_name: 'Hall',
              start_time: '2030-01-01T10:00:00Z',
              status: cancelled ? 'cancelled' : 'upcoming',
              has_assigned_seating: false,
            }
          else if (path === '/api/events/event-1/ticket-types') body = []
          else if (path === '/api/tickets/my-tickets')
            body = [
              {
                id: 'ticket-1',
                event_id: 'event-1',
                event_title: 'Calendar test event',
                event_status: cancelled ? 'cancelled' : 'upcoming',
                status: 'refunded',
              },
            ]
          else if (path === '/api/events/event-1/export.ics') {
            await pause(150)
            if (failCalendar) {
              status = 404
              body = { detail: 'Calendar not available' }
            } else {
              type = 'text/calendar; charset=utf-8'
              body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1@biletflow\r\nSTATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
            }
          } else {
            status = 404
            body = { detail: 'Not found' }
          }
          await browser.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: status,
            responseHeaders: [
              { name: 'Content-Type', value: type },
              { name: 'Access-Control-Allow-Origin', value: '*' },
              { name: 'Access-Control-Allow-Headers', value: '*' },
              {
                name: 'Access-Control-Allow-Methods',
                value: 'GET,POST,OPTIONS',
              },
            ],
            body: Buffer.from(
              type.startsWith('text/calendar') ? body : JSON.stringify(body),
            ).toString('base64'),
          })
        })().catch((e) => {
          if (!e.message.includes('Invalid InterceptionId')) errors.push(e)
        })
      })
      await browser.send('Fetch.enable', {
        patterns: [{ urlPattern: '*localhost:8000/*' }],
      })
      await browser.navigate('/login')
      await browser.wait('Sign in')
      await browser.evaluate(
        'localStorage.setItem("biletflow_token","utilities-token")',
      )
      await t.test(
        'notifications remain unread on opening; messages are escaped and timezone is explicit',
        async () => {
          await browser.navigate('/notifications')
          await browser.wait('Ticket confirmed')
          assert.equal(writes().length, 0)
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".notification-list img")',
            ),
            null,
          )
          assert.ok(await browser.has('Almaty time'))
          assert.ok(await browser.has('15:00'))
        },
      )
      await t.test(
        'unread filter persists, failed marking keeps records, double submit sends once',
        async () => {
          await browser.evaluate(
            `const select=document.querySelector('select[name="notification_filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'unread');select.dispatchEvent(new Event('change',{bubbles:true}))`,
          )
          await eventually(async () =>
            (await browser.evaluate('location.search')) === '?unread_only=true' &&
            (await browser.has('Ticket confirmed')) && !(await browser.has('Old message')),
          'Unread filter committed and filtered records loaded')
          assert.equal(
            await browser.evaluate('location.search'),
            '?unread_only=true',
          )
          await eventually(() => browser.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent === 'Mark all notifications as read' && !b.disabled)`), 'Unread notifications loaded')
          failWrite = true
          await browser.click('Mark all notifications as read')
          await browser.wait('Could not mark notifications')
          assert.equal(notices[0].is_read, false)
          failWrite = false
          const before = writes().length
          await browser.evaluate(
            `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Mark all notifications as read');b.click();b.click()})()`,
          )
          await browser.wait('No unread notifications.')
          assert.equal(writes().length - before, 1)
          await browser.navigate('/notifications?unread_only=true')
          await browser.wait('No unread notifications.')
        },
      )
      await t.test(
        'notification failure retries and changing account cannot display the previous inbox',
        async () => {
          failRead = true
          await browser.navigate('/notifications')
          await browser.wait('Notifications unavailable')
          failRead = false
          await browser.click('Retry')
          await browser.wait('Ticket confirmed')
          account = 'user-2'
          await browser.navigate('/notifications')
          await browser.wait('No notifications yet.')
          assert.equal(await browser.has('Ticket confirmed'), false)
          account = 'user-1'
        },
      )
      await t.test(
        'calendar downloads authenticated ICS, with one request on double click',
        async () => {
          await browser.navigate('/events/event-1')
          await browser.wait('Add to calendar (.ics)')
          const before = requests.filter(
            (r) => r.method === 'GET' && r.url.includes('export.ics'),
          ).length
          await browser.evaluate(
            `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Add to calendar (.ics)');b.click();b.click()})()`,
          )
          await browser.wait('Calendar file prepared.')
          assert.equal(
            requests.filter(
              (r) => r.method === 'GET' && r.url.includes('export.ics'),
            ).length - before,
            1,
          )
          assert.equal(
            await browser.evaluate('window.downloads[0]'),
            'event-event-1.ics',
          )
          assert.ok(
            (await browser.evaluate('window.calendarBlobs[0].text()')).includes(
              'UID:event-1@biletflow',
            ),
          )
          assert.equal(
            requests
              .filter((r) => r.method === 'GET' && r.url.includes('export.ics'))
              .at(-1).headers.Authorization,
            'Bearer utilities-token',
          )
        },
      )
      await t.test(
        'calendar errors never download JSON and can be retried',
        async () => {
          failCalendar = true
          await browser.click('Add to calendar (.ics)')
          await browser.wait('Record not found')
          assert.equal(await browser.evaluate('window.downloads.length'), 1)
          failCalendar = false
          await browser.click('Add to calendar (.ics)')
          await browser.wait('Calendar file prepared.')
          assert.equal(await browser.evaluate('window.downloads.length'), 2)
        },
      )
      await t.test(
        'ticket cards export event cancellation rather than adding an active event',
        async () => {
          cancelled = true
          await browser.navigate('/my-tickets')
          await browser.wait('Download calendar cancellation (.ics)')
          await browser.click('Download calendar cancellation (.ics)')
          await browser.wait('Calendar file prepared.')
          assert.ok(
            (await browser.evaluate('window.calendarBlobs[0].text()')).includes(
              'STATUS:CANCELLED',
            ),
          )
          cancelled = false
        },
      )
      await t.test(
        'public event calendars work without a saved token',
        async () => {
          await browser.evaluate('localStorage.removeItem("biletflow_token")')
          await browser.navigate('/events/event-1')
          await browser.wait('Add to calendar (.ics)')
          await browser.click('Add to calendar (.ics)')
          await browser.wait('Calendar file prepared.')
          assert.equal(
            requests
              .filter((r) => r.method === 'GET' && r.url.includes('export.ics'))
              .at(-1).headers.Authorization,
            undefined,
          )
        },
      )
      await t.test(
        'non-admin and anonymous deep links never fetch failed payments',
        async () => {
          await browser.navigate('/admin/payment-failures')
          await browser.wait('Sign in')
          await browser.evaluate(
            'localStorage.setItem("biletflow_token","utilities-token")',
          )
          role = 'organizer'
          const before = requests.filter((r) =>
            r.url.includes('payment-failures'),
          ).length
          await browser.navigate('/admin/payment-failures')
          await browser.wait('only for platform administrators')
          assert.equal(
            requests.filter((r) => r.url.includes('payment-failures')).length,
            before,
          )
        },
      )
      await t.test(
        'admin sees failures, decimal amounts, missing reference and safe local search',
        async () => {
          role = 'platform_admin'
          await browser.navigate('/admin/payment-failures')
          await browser.wait('buyer@example.com')
          assert.ok(await browser.has('1,250.50'))
          assert.ok(await browser.has('Not recorded'))
          assert.equal(
            await browser.evaluate('document.querySelector("table script")'),
            null,
          )
          await browser.evaluate(
            `const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'FAILED-REFERENCE');input.dispatchEvent(new Event('input',{bubbles:true}))`,
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll("tbody tr").length',
            ),
            1,
          )
          assert.equal(await browser.has('buyer@example.com'), false)
        },
      )
      await t.test(
        'admin denial and empty states recover on refresh; page stays read-only on mobile',
        async () => {
          failPayments = true
          await browser.click('Refresh payment failures')
          await browser.wait('You do not have access')
          failPayments = false
          emptyPayments = true
          await browser.click('Retry')
          await browser.wait('No failed payments.')
          emptyPayments = false
          await browser.click('Refresh payment failures')
          await browser.wait('loaded failures shown')
          await browser.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
          })
          assert.equal(
            await browser.evaluate(
              'document.documentElement.scrollWidth <= innerWidth',
            ),
            true,
          )
          assert.equal(
            writes().some((r) => r.url.includes('/admin/')),
            false,
          )
        },
      )
      await t.test(
        'expired notification session clears token and returns to login',
        async () => {
          expire = true
          await browser.navigate('/notifications')
          await browser.wait('Sign in')
          assert.equal(
            await browser.evaluate('localStorage.getItem("biletflow_token")'),
            null,
          )
        },
      )
      assert.deepEqual(errors, [])
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
