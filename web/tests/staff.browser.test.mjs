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
  'staff creation, event assignments and revocation',
  { skip: !chrome, timeout: 120_000 },
  async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-staff-'))
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
    const errors = []
    const writes = []
    let listError = false
    const staff = [
      {
        id: 'staff-user-1',
        full_name: 'Existing Staff',
        email: 'existing@example.com',
        status: 'active',
        is_suspended: false,
      },
    ]
    const user = {
      id: 'organizer-1',
      full_name: 'Test Organizer',
      role: 'organizer',
    }
    async function fill(name, value) {
      await browser.evaluate(`(() => {
      const input = document.querySelector('input[name="${name}"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    }
    async function rowAction(email) {
      await browser.evaluate(`(() => {
      const row = [...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes(${JSON.stringify(email)}));
      row.querySelector('button').click();
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
          const path = new URL(request.url).pathname
          let status = 200
          let body = {}
          if (request.method === 'OPTIONS') status = 204
          else if (path === '/api/auth/me') body = user
          else if (path === '/api/organizer/events')
            body = [
              {
                id: 'event-1',
                title: 'Staff test event',
                start_time: '2030-01-01T19:00:00+05:00',
                venue_name: 'Hall',
                phase: 'upcoming',
              },
            ]
          else if (
            path === '/api/events/event-1/staff' &&
            request.method === 'GET'
          ) {
            if (listError) {
              status = 503
              body = { detail: 'Staff list unavailable' }
            } else body = staff
          } else if (
            path === '/api/events/event-1/staff' &&
            request.method === 'POST'
          ) {
            const input = JSON.parse(request.postData)
            writes.push({ method: 'POST', path, body: input })
            await pause(150)
            const existing = staff.find(
              (member) => member.email === input.email,
            )
            if (input.email === 'wrong-role@example.com') {
              status = 409
              body = {
                detail:
                  'That email belongs to an account that is not a door-staff account',
              }
            } else if (input.mode === 'create' && existing) {
              status = 409
              body = { detail: 'An account with this email already exists.' }
            } else if (input.mode === 'assign' && !existing) {
              status = 404
              body = {
                detail:
                  'No door-staff account found for this email. Use Create new staff account instead.',
              }
            } else {
              const already = existing?.status === 'active'
              if (existing) existing.status = 'active'
              else
                staff.push({
                  id: 'staff-user-2',
                  full_name: input.full_name,
                  email: input.email,
                  status: 'active',
                  is_suspended: false,
                })
              body = { already_assigned: already, staff: staff.at(-1) }
              status = 201
            }
          } else if (
            path.startsWith('/api/events/event-1/staff/') &&
            request.method === 'DELETE'
          ) {
            writes.push({ method: 'DELETE', path })
            await pause(150)
            staff.find(
              (member) => member.id === path.split('/').at(-1),
            ).status = 'revoked'
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
                value: 'GET,POST,DELETE,OPTIONS',
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
        'localStorage.setItem("biletflow_token", "staff-test-token")',
      )
      await browser.navigate('/organizer/events/event-1/staff')
      await browser.wait('existing@example.com')

      await t.test(
        'assignment sends only email and mode and explains missing account',
        async () => {
          await fill('email', 'missing@example.com')
          await browser.click('Assign staff')
          await browser.wait('No door-staff account found')
          assert.deepEqual(writes.at(-1).body, {
            email: 'missing@example.com',
            mode: 'assign',
          })
        },
      )
      await t.test(
        'non-staff email is rejected with a visible error',
        async () => {
          await fill('email', 'wrong-role@example.com')
          await browser.click('Assign staff')
          await browser.wait('not a door-staff account')
          assert.equal(staff.length, 1)
        },
      )
      await t.test(
        'password confirmation and UTF-8 byte limits prevent invalid requests',
        async () => {
          await browser.evaluate(
            'document.querySelector("input[value=create]").click()',
          )
          await browser.wait('Initial password')
          await fill('email', 'new@example.com')
          await fill('full_name', 'New Door Staff')
          await fill('password', 'initial-password')
          await fill('confirm_password', 'different-password')
          const before = writes.length
          await browser.click('Create and assign')
          await browser.wait('passwords do not match')
          await fill('password', 'é'.repeat(37))
          await fill('confirm_password', 'é'.repeat(37))
          await browser.click('Create and assign')
          await browser.wait('at most 72 UTF-8 bytes')
          assert.equal(writes.length, before)
        },
      )
      await t.test(
        'creation blocks double submit and clears passwords on success',
        async () => {
          await fill('password', 'initial-password')
          await fill('confirm_password', 'initial-password')
          const before = writes.length
          await browser.evaluate(
            '(() => { const form = document.querySelector(".org-staff-form"); form.requestSubmit(); form.requestSubmit(); })()',
          )
          await browser.wait('Staff account created and assigned')
          await browser.wait('new@example.com')
          assert.equal(writes.length - before, 1)
          assert.equal(writes.at(-1).body.mode, 'create')
          assert.equal(writes.at(-1).body.full_name, 'New Door Staff')
          assert.equal(
            await browser.evaluate(
              'document.querySelector("input[name=password]").value',
            ),
            '',
          )
          assert.equal(await browser.has('initial-password'), false)
          assert.equal(await browser.evaluate('localStorage.length'), 1)
        },
      )
      await t.test(
        'revoke requires confirmation, can be cancelled and uses user ID',
        async () => {
          const before = writes.length
          await rowAction('existing@example.com')
          await browser.wait('Revoke event access?')
          await browser.click('Cancel')
          assert.equal(writes.length, before)
          await rowAction('existing@example.com')
          await browser.evaluate(
            '(() => { const button = [...document.querySelectorAll("button")].find(button => button.textContent === "Confirm revoke"); button.click(); button.click(); })()',
          )
          await browser.wait('Access to this event revoked')
          await browser.wait('Restore access')
          assert.equal(writes.length - before, 1)
          assert.equal(
            writes.at(-1).path,
            '/api/events/event-1/staff/staff-user-1',
          )
        },
      )
      await t.test('restoration never sends a new password', async () => {
        await rowAction('existing@example.com')
        await browser.wait('Access to this event restored')
        await browser.wait('2 active staff')
        assert.deepEqual(writes.at(-1).body, {
          email: 'existing@example.com',
          mode: 'assign',
        })
      })
      await t.test(
        'suspended account is labelled and cannot be restored',
        async () => {
          staff.push({
            id: 'suspended',
            full_name: 'Suspended Staff',
            email: 'suspended@example.com',
            status: 'revoked',
            is_suspended: true,
          })
          await browser.click('Refresh staff')
          await browser.wait('Suspended — cannot sign in')
          assert.equal(
            await browser.evaluate(
              '[...document.querySelectorAll("tbody tr")].find(row => row.textContent.includes("suspended@example.com")).querySelector("button").disabled',
            ),
            true,
          )
        },
      )
      await t.test(
        'load failure disables mutations and can be retried',
        async () => {
          listError = true
          await browser.click('Refresh staff')
          await browser.wait('Staff list unavailable')
          assert.equal(
            await browser.evaluate(
              'document.querySelector(".org-staff-form fieldset").disabled',
            ),
            true,
          )
          listError = false
          await browser.click('Retry')
          await browser.wait('existing@example.com')
        },
      )
      await t.test(
        'mobile layout and wrong-event access remain safe',
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
          if (process.env.TEST_STAFF_SCREENSHOT) {
            const image = await browser.send('Page.captureScreenshot', {
              format: 'png',
              captureBeyondViewport: true,
            })
            await writeFile(
              process.env.TEST_STAFF_SCREENSHOT,
              Buffer.from(image.data, 'base64'),
            )
          }
          await browser.navigate('/organizer/events/foreign/staff')
          await browser.wait('Event not found')
          assert.equal(await browser.has('existing@example.com'), false)
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
