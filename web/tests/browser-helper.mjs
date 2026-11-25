const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function eventually(check, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}

export class Browser {
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
    await this.send('Page.setLifecycleEventsEnabled', { enabled: true })
    const loaded = new Set()
    const previous = this.events.get('Page.lifecycleEvent')
    this.events.set('Page.lifecycleEvent', (event) => {
      if (event.name === 'DOMContentLoaded') loaded.add(event.loaderId)
      previous?.(event)
    })
    try {
      const { loaderId, errorText } = await this.send('Page.navigate', { url: base + path })
      if (errorText) throw new Error(errorText)
      if (loaderId) await eventually(() => loaded.has(loaderId), `Document ready at ${path}`)
    } finally {
      if (previous) this.events.set('Page.lifecycleEvent', previous)
      else this.events.delete('Page.lifecycleEvent')
    }
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

