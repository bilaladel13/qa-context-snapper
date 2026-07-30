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

const fakeWindow = {
  addEventListener: (type, handler) => {
    ;(listeners[type] = listeners[type] ?? []).push(handler)
  },
  removeEventListener: () => {},
  postMessage: (message) => posted.push(message),
}

globalThis.window = fakeWindow
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

const captured = posted.filter((message) => message?.channel === 'test/channel')
const levels = captured.map((message) => `${message.payload.origin}:${message.payload.level}`)

const failures = []

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
