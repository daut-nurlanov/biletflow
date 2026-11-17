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
  'history filters, read-only records and older-page loading',
  { skip: !chrome, timeout: 120_000 },
  async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-history-'))
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
    const requests = []
    const errors = []
    let failOlder = false
    let slowStaff = false
    const entries = Array.from({ length: 55 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(1000 - index).padStart(12, '0')}`,
      timestamp: new Date(
        Date.parse('2029-04-10T12:00:00Z') - index * 1000,
      ).toISOString(),
      actor: index === 1 ? null : 'Audit Organizer',
      actor_id: index === 1 ? null : 'actor-1',
      action:
        index === 2
          ? 'future_action'
          : index === 3
            ? 'constructor'
            : index % 2
              ? 'staff_assigned'
              : 'order_refunded',
      entity_type: index % 2 ? 'user' : 'order',
      entity_id: `entity-${index}`,
      details:
        index === 0
          ? '<img src=x onerror="window.historyInjected=true">'
          : `Record ${index}`,
    }))
    async function setField(name, value) {
      await browser.evaluate(`(() => {
      const element = document.querySelector('[name="${name}"]');
      const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    }
    try {
      await eventually(
        () => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr),
        'Chrome startup',
      )
      const endpoint = new URL(
        stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1],
      )
      const targets = await fetch(`http://${endpoint.host}/json/list`).then(
        (response) => response.json(),
      )
      await browser.connect(
        targets.find((target) => target.type === 'page').webSocketDebuggerUrl,
      )
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      browser.events.set('Fetch.requestPaused', ({ requestId, request }) => {
        void (async () => {
          const url = new URL(request.url)
          requests.push(request)
          let status = 200
          let body = {}
          if (request.method === 'OPTIONS') status = 204
          else if (url.pathname === '/api/auth/me')
            body = {
              id: 'organizer-1',
              role: 'organizer',
              full_name: 'Audit Organizer',
            }
          else if (url.pathname === '/api/organizer/events')
            body = [
              {
                id: 'event-1',
                title: 'History test event',
                phase: 'completed',
                start_time: '2029-04-01T19:00:00+05:00',
                venue_name: 'Hall',
              },
            ]
          else if (url.pathname === '/api/events/event-1/timeline') {
            const before = url.searchParams.get('before')
            const action = url.searchParams.get('action')
            if (slowStaff && action === 'staff_assigned') await pause(400)
            if (before && failOlder) {
              status = 503
              body = { detail: 'Older activity unavailable' }
            } else {
              const from = url.searchParams.get('date_from')
              const to = url.searchParams.get('date_to')
              body = entries
                .filter((entry) => {
                  if (action && entry.action !== action) return false
                  if (
                    from &&
                    Date.parse(entry.timestamp) <
                      Date.parse(`${from}T00:00:00+05:00`)
                  )
                    return false
                  if (
                    to &&
                    Date.parse(entry.timestamp) >
                      Date.parse(`${to}T23:59:59.999+05:00`)
                  )
                    return false
                  if (before) {
                    const [timestamp, id] = before.split('|')
                    if (
                      Date.parse(entry.timestamp) > Date.parse(timestamp) ||
                      (Date.parse(entry.timestamp) === Date.parse(timestamp) &&
                        entry.id >= id)
                    )
                      return false
                  }
                  return true
                })
                .slice(0, Number(url.searchParams.get('limit')))
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
              { name: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
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
        'localStorage.setItem("biletflow_token", "history-test-token")',
      )
      await browser.navigate('/organizer/events/event-1/history')
      await browser.wait('50 activity records loaded')

      await t.test(
        'records show actor, seconds, safe text, links and read-only identifiers',
        async () => {
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll(".org-history-entry").length',
            ),
            50,
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-history time").textContent',
            ),
            '10 Apr 2029, 17:00:00',
          )
          assert.ok(await browser.has('System or unavailable user'))
          assert.equal(
            await browser.evaluate('Boolean(window.historyInjected)'),
            false,
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-history img")',
            ),
            null,
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-history a").getAttribute("href")',
            ),
            '/organizer/events/event-1/orders/entity-0',
          )
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll(".org-history button, .org-history input, .org-history textarea").length',
            ),
            0,
          )
        },
      )
      await t.test(
        'older-page failure keeps existing records and retry appends without duplicates',
        async () => {
          failOlder = true
          await browser.click('Load older activity')
          await browser.wait('Older activity unavailable')
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll(".org-history-entry").length',
            ),
            50,
          )
          failOlder = false
          await browser.click('Retry')
          await browser.wait('55 activity records loaded')
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll(".org-history-entry").length',
            ),
            55,
          )
          const paged = requests.find((request) =>
            new URL(request.url).searchParams.has('before'),
          )
          assert.equal(
            new URL(paged.url).searchParams.get('before'),
            `${entries[49].timestamp}|${entries[49].id}`,
          )
          assert.ok(await browser.has('End of activity for these filters'))
        },
      )
      await t.test(
        'form filters reach the server and restore after reload',
        async () => {
          await setField('date_from', '2029-04-10')
          await setField('date_to', '2029-04-10')
          await setField('action', 'order_refunded')
          await browser.click('Apply filters')
          await browser.wait('End of activity for these filters')
          assert.ok(
            requests.some((request) =>
              request.url.includes(
                'date_from=2029-04-10&date_to=2029-04-10&action=order_refunded',
              ),
            ),
          )
          assert.equal(
            await browser.evaluate(
              '[...document.querySelectorAll(".org-history h3")].every(title => title.textContent === "Order refunded")',
            ),
            true,
          )
          await browser.navigate(
            '/organizer/events/event-1/history?date_from=2029-04-10&date_to=2029-04-10&action=order_refunded',
          )
          await browser.wait('End of activity for these filters')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("select[name=action]").value',
            ),
            'order_refunded',
          )
        },
      )
      await t.test(
        'unknown action codes including object prototype names remain usable',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/history?action=constructor',
          )
          await browser.wait('Record 3')
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-history h3").textContent',
            ),
            'Constructor',
          )
          await browser.navigate(
            '/organizer/events/event-1/history?action=future_action',
          )
          await browser.wait('Record 2')
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-history h3").textContent',
            ),
            'Future action',
          )
        },
      )
      await t.test(
        'invalid dates issue no history request and reset restores the first page',
        async () => {
          const before = requests.filter((request) =>
            request.url.includes('/timeline'),
          ).length
          await browser.navigate(
            '/organizer/events/event-1/history?date_from=2029-04-11&date_to=2029-04-10',
          )
          await browser.wait('The start date must not be after the end date')
          assert.equal(
            requests.filter((request) => request.url.includes('/timeline'))
              .length,
            before,
          )
          await browser.click('Reset filters')
          await browser.wait('50 activity records loaded')
        },
      )
      await t.test(
        'out-of-order responses never replace the current activity selection',
        async () => {
          slowStaff = true
          await setField('action', 'staff_assigned')
          await browser.click('Apply filters')
          await eventually(
            () =>
              requests.some(
                (request) =>
                  new URL(request.url).searchParams.get('action') ===
                  'staff_assigned',
              ),
            'delayed staff query',
          )
          await setField('action', 'order_refunded')
          await browser.click('Apply filters')
          await browser.wait('End of activity for these filters')
          await pause(500)
          assert.equal(
            await browser.evaluate(
              '[...document.querySelectorAll(".org-history h3")].every(title => title.textContent === "Order refunded")',
            ),
            true,
          )
          slowStaff = false
        },
      )
      await t.test(
        'empty period and refresh use a fresh first page',
        async () => {
          await browser.navigate(
            '/organizer/events/event-1/history?date_from=2099-01-01',
          )
          await browser.wait('No activity matches these filters')
          await browser.click('Reset filters')
          await browser.wait('50 activity records loaded')
          await browser.click('Load older activity')
          await browser.wait('55 activity records loaded')
          await browser.click('Refresh history')
          await browser.wait('50 activity records loaded')
        },
      )
      await t.test(
        'mobile layout stays within viewport and foreign events are denied',
        async () => {
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
          if (process.env.TEST_HISTORY_SCREENSHOT) {
            const screenshot = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: false,
            })
            await writeFile(
              process.env.TEST_HISTORY_SCREENSHOT,
              Buffer.from(screenshot.data, 'base64'),
            )
          }
          const before = requests.filter((request) =>
            request.url.includes('/timeline'),
          ).length
          await browser.navigate('/organizer/events/foreign/history')
          await browser.wait('Event not found')
          assert.equal(
            requests.filter((request) => request.url.includes('/timeline'))
              .length,
            before,
          )
        },
      )
      assert.equal(
        requests.some(
          (request) => !['GET', 'OPTIONS'].includes(request.method),
        ),
        false,
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
