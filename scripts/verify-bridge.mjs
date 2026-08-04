import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')
const MARKER = '__qaContextSnapper'

function findBundle() {
  for (const name of readdirSync(ASSETS)) {
    if (!name.endsWith('.js')) continue
    const contents = readFileSync(join(ASSETS, name), 'utf8')
    if (contents.includes(MARKER)) {
      return contents
    }
  }
  throw new Error('The console bridge was not found in dist/assets. Run npm run build first.')
}

function extractFunction(source) {
  const marker = source.indexOf(MARKER)
  const start = source.lastIndexOf('function ', marker)
  const open = source.indexOf('{', start)

  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  throw new Error('Could not delimit the console bridge function.')
}

const bridgeSource = extractFunction(findBundle())

// chrome.scripting serializes func with toString and re-parses it in the page.
// Any reference to an outer binding would throw here instead of at runtime in Chrome.
const bridge = new Function(`return (${bridgeSource})`)()

const listeners = {}
const posted = []
const passedThrough = []

const fetchCalls = []

const originalFetch = async (url) => {
  fetchCalls.push(url)
  return { status: url.includes('boom') ? 500 : 200 }
}

const fakeWindow = {
  addEventListener: (type, handler) => {
    ;(listeners[type] = listeners[type] ?? []).push(handler)
  },
  removeEventListener: () => {},
  postMessage: (message) => posted.push(message),
  fetch: originalFetch,
}

// The bridge patches XHR and fetch, so the harness has to own both.
class FakeXhr {
  constructor() {
    this.status = 0
    this.handlers = {}
  }
  addEventListener(type, handler) {
    this.handlers[type] = handler
  }
  finish(status) {
    this.status = status
    this.handlers.loadend?.()
  }
}

FakeXhr.prototype.open = function (method, url) {
  this.openedWith = [method, url]
}
FakeXhr.prototype.send = function () {
  this.sent = true
}

globalThis.window = fakeWindow
globalThis.XMLHttpRequest = FakeXhr
globalThis.location = { href: 'https://app.example.com/members' }
globalThis.URL = URL
globalThis.Element = class Element {}
globalThis.console = {
  error: (...args) => passedThrough.push(['error', args.length]),
  warn: (...args) => passedThrough.push(['warn', args.length]),
}

bridge('test/channel', 'session-1')

globalThis.console.error('boom', new Error('kaboom'), { a: 1 })
listeners.error?.[0]?.({
  message: 'script blew up',
  filename: 'app.js',
  lineno: 12,
  colno: 3,
  error: new Error('x'),
})
listeners.unhandledrejection?.[0]?.({ reason: new Error('nope') })

// A failing API call the page swallows: the exact case the console cannot see.
await fakeWindow.fetch('https://api.example.com/boom?token=SECRET123&page=2')
await fakeWindow.fetch('https://api.example.com/fine')

const xhr = new globalThis.XMLHttpRequest()
xhr.open('DELETE', 'https://api.example.com/members/7')
xhr.send()
xhr.finish(403)

const captured = posted.filter((message) => message?.channel === 'test/channel')
const consolePayloads = captured.filter((message) => message.payload.kind !== 'network')
const networkPayloads = captured.filter((message) => message.payload.kind === 'network')
const levels = consolePayloads.map((message) => `${message.payload.origin}:${message.payload.level}`)

const failed = networkPayloads.find((message) => message.payload.outcome === 'failed')
const succeeded = networkPayloads.find((message) => message.payload.outcome === 'success')
const viaXhr = networkPayloads.find((message) => message.payload.method === 'DELETE')

const failures = []

if (networkPayloads.length !== 3) {
  failures.push(`expected three network payloads, saw ${networkPayloads.length}`)
}
if (failed?.payload.status !== 500) {
  failures.push('a 500 response was not recorded as a failure')
}
if (succeeded?.payload.status !== 200) {
  failures.push('a successful response was not recorded')
}
if (viaXhr?.payload.status !== 403) {
  failures.push('an XHR failure was not recorded')
}
// A bearer token in a query string must never reach a report.
if (failed?.payload.url.includes('SECRET123')) {
  failures.push('a sensitive query value was not redacted')
}
if (!failed?.payload.url.includes('redacted')) {
  failures.push('the sensitive query value was dropped instead of redacted')
}
if (!failed?.payload.url.includes('page=2')) {
  failures.push('an ordinary query value was redacted unnecessarily')
}
if (fetchCalls.length !== 2) {
  failures.push('the original fetch was not called through')
}

if (!fakeWindow[`${MARKER}:test/channel`]) {
  failures.push('the bridge did not register its control handle on window')
}
if (!levels.includes('console:error')) {
  failures.push('console.error was not captured')
}
if (!levels.includes('window:error')) {
  failures.push('window error events were not captured')
}
if (!levels.includes('window:unhandledrejection')) {
  failures.push('unhandled rejections were not captured')
}
if (passedThrough.length === 0) {
  failures.push('the original console.error was not called through')
}

const report = process.stdout.write.bind(process.stdout)

if (failures.length > 0) {
  report(`console bridge verification FAILED\n`)
  for (const failure of failures) {
    report(`  - ${failure}\n`)
  }
  process.exit(1)
}

report(`console bridge verified: ${levels.join(', ')}\n`)
report(`original console preserved: ${JSON.stringify(passedThrough)}\n`)
report(
  `network bridge verified: ${networkPayloads
    .map((message) => `${message.payload.method} ${message.payload.status ?? 'error'}`)
    .join(', ')}\n`,
)
report(`sensitive query redacted: ${failed?.payload.url}\n`)
