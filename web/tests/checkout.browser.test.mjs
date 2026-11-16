import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Browser, eventually, pause } from './browser-helper.mjs'

const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)

test('attendee checkout quote safety, retries, simulated purchase and QR visibility',
  { skip: !chrome, timeout: 120_000 }, async (t) => {
    const profile = await mkdtemp(join(tmpdir(), 'biletflow-checkout-'))
    const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    const browser = new Browser()
    let stderr = ''
    child.stderr.on('data', (data) => { stderr += data })
    const errors = []
    try {
      await eventually(() => /DevTools listening on (ws:\/\/[^\s]+)/.test(stderr), 'Chrome startup')
      const address = new URL(stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)[1])
      const targets = await fetch(`http://${address.host}/json/list`).then((r) => r.json())
      await browser.connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
      await browser.send('Page.enable')
      await browser.send('Runtime.enable')
      const event = { id: 'event-1', title: 'Checkout event', start_time: '2030-01-01T12:00:00Z',
        venue_name: 'Hall', has_assigned_seating: false, is_paid_sales_active: true }
      const types = [
        { id: 'paid', event_id: event.id, name: 'Standard', price: 1000, quantity_available: 10, max_per_order: 5 },
        { id: 'free', event_id: event.id, name: 'Free ticket', price: 0, quantity_available: 10, max_per_order: 5 },
      ]
      const user = { id: 'buyer-1', full_name: 'Test Attendee', email: 'buyer@example.com', role: 'attendee' }
      let quoteDelay = 0
      let quoteFailure = false
      let purchases = []
      let ticketStatus = 'valid'
      let eventStatus = 'upcoming'
      browser.events.set('Fetch.requestPaused', (params) => {
        void (async () => {
          const { requestId, request } = params
          const url = new URL(request.url)
          let status = 200
          let body = {}
          if (request.method === 'OPTIONS') status = 204
          else if (url.pathname === '/api/auth/me') body = user
          else if (url.pathname.endsWith('/ticket-types')) body = types
          else if (url.pathname === '/api/events/event-1') body = event
          else if (url.pathname === '/api/campaigns/resolve') body = { event_id: event.id, promo_code: 'SAVE20' }
          else if (url.pathname === '/api/orders/quote') {
            const input = JSON.parse(request.postData)
            await pause(quoteDelay)
            if (quoteFailure) { status = 500; body = { detail: 'Quote temporarily unavailable' } }
            else {
              const subtotal = (input.ticket_type_id === 'paid' ? 1000 : 0) * input.quantity
              const discount = input.promo_code === 'SAVE20' ? subtotal * .2 : 0
              body = { subtotal, discount, total: subtotal - discount }
            }
          } else if (url.pathname === '/api/orders/checkout') {
            purchases.push(request)
            await pause(300)
            status = 201
            body = { order: { id: 'order-1' } }
          } else if (url.pathname === '/api/tickets/my-tickets') body = [
            { id: 'ticket-1', attendee_name: user.full_name, event_title: event.title, status: ticketStatus, event_status: eventStatus },
          ]
          else if (url.pathname.endsWith('/qr.png')) {
            await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: '' })
            return
          } else { status = 404; body = { detail: 'Not found' } }
          await browser.send('Fetch.fulfillRequest', { requestId, responseCode: status,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' },
              { name: 'Access-Control-Allow-Origin', value: '*' },
              { name: 'Access-Control-Allow-Headers', value: '*' },
              { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }],
            body: Buffer.from(JSON.stringify(body)).toString('base64') })
        })().catch((error) => {
          // React aborts obsolete requests on navigation and under StrictMode.
          if (!error.message.includes('Invalid InterceptionId')) errors.push(error)
        })
      })
      await browser.send('Fetch.enable', { patterns: [
        { urlPattern: '*localhost:8000/*' }, { urlPattern: '*127.0.0.1:8000/*' },
      ] })
      await browser.navigate('/login')
      await browser.wait('Sign in')
      await browser.evaluate('localStorage.setItem("biletflow_token", "test-token")')
      const buyButton = `([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Buy'))`

      await t.test('campaign landing applies discount and stale quote cannot buy', async () => {
        await browser.navigate('/events/event-1?c=campaign')
        await browser.wait('Standard')
        await browser.evaluate(`document.querySelector('button.choice').click()`)
        await browser.wait('Promo code SAVE20 applied')
        await browser.wait('Total')
        assert.equal(await browser.has('800'), true)
        quoteDelay = 400
        await browser.evaluate(`(() => { const e=document.querySelector('#quantity');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');
          e.dispatchEvent(new Event('input',{bubbles:true})); })()`)
        await browser.wait('Calculating price')
        assert.equal(await browser.evaluate(`${buyButton}.disabled`), true)
        await browser.wait('Total')
        quoteDelay = 0
      })
      await t.test('quote errors are readable and retry succeeds without changing selection', async () => {
        quoteFailure = true
        await browser.evaluate(`document.querySelectorAll('button.choice')[1].click()`)
        await browser.wait('Quote temporarily unavailable')
        assert.equal(await browser.evaluate(`${buyButton}.disabled`), true)
        quoteFailure = false
        await browser.click('Retry quote')
        await browser.wait('Total')
        assert.equal(await browser.evaluate(`${buyButton}.disabled`), false)
      })
      await t.test('free and paid checkout send token and idempotency key, lock controls, then show tickets', async () => {
        for (const type of ['free', 'paid']) {
          if (type === 'paid') {
            await browser.navigate('/events/event-1')
            await browser.wait('Standard')
            await browser.evaluate(`document.querySelector('button.choice').click()`)
            await browser.wait('Total')
          }
          const before = purchases.length
          await browser.evaluate(`${buyButton}.click(); ${buyButton}.click()`)
          await browser.wait('Processing')
          assert.equal(await browser.evaluate(`document.querySelector('#quantity').disabled`), true)
          await browser.wait('Purchase successful')
          assert.equal(purchases.length, before + 1)
          assert.equal(JSON.parse(purchases.at(-1).postData).ticket_type_id, type)
          assert.equal(purchases.at(-1).headers.Authorization, 'Bearer test-token')
          assert.ok(purchases.at(-1).headers['Idempotency-Key'])
        }
      })
      await t.test('QR is displayed only for usable tickets and events', async () => {
        for (const status of ['valid', 'checked_in', 'cancelled', 'refunded']) {
          ticketStatus = status
          for (const state of ['upcoming', 'cancelled', 'suspended']) {
            eventStatus = state
            await browser.navigate('/my-tickets')
            await browser.wait('Checkout event')
            assert.equal(await browser.evaluate('document.querySelectorAll("img.qr").length'),
              status === 'valid' && state === 'upcoming' ? 1 : 0, `${status}/${state}`)
          }
        }
      })
      assert.deepEqual(errors, [])
    } finally {
      browser.socket?.close()
      child.kill()
      await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve))
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 })
    }
  })
