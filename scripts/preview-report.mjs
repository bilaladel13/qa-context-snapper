import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-preview')

await build({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    lib: { entry: resolve(ROOT, 'src/generator/index.ts'), formats: ['es'], fileName: () => 'generator.js' },
  },
  resolve: { alias: { '@': resolve(ROOT, 'src') } },
})

const { generateReport, generatePlaywrightScript } = await import(
  pathToFileURL(resolve(OUT, 'generator.js')).href
)

const started = Date.parse('2026-07-30T10:00:00.000Z')
const at = (offset) => started + offset

const target = (over) => {
  const merged = { strategy: 'css', value: '', tagName: 'div', cssSelector: 'div', ...over }
  return {
    ...merged,
    candidates: {
      css: merged.cssSelector,
      [merged.strategy]: merged.value,
      ...(merged.accessibleName ? { text: merged.accessibleName } : {}),
    },
  }
}

// Mirrors how locator.ts truncates: exactly 80 characters ending in an ellipsis.
const truncatedName = `${'Place order and pay now for the entire basket including shipping and handling'.slice(0, 77)}...`

const snapshot = {
  sessionId: 'preview',
  startedAt: started,
  stoppedAt: at(95_000),
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.7390.55',
    os: 'Windows 11',
    screenSize: '2560x1440',
    viewportSize: '1280x720',
    devicePixelRatio: 1.5,
    language: 'en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    pageUrl: 'https://shop.example.com/cart',
    pageTitle: "Cart | Bob's Shop",
    capturedAt: '2026-07-30T10:00:00.000Z',
  },
  interactions: [
    { id: '1', type: 'navigation', target: null, value: 'https://shop.example.com/cart', url: 'https://shop.example.com/cart', timestamp: at(0) },
    { id: '2', type: 'click', target: target({ strategy: 'testId', value: 'checkout-btn', tagName: 'button', cssSelector: 'button#co' }), url: 'x', timestamp: at(1000) },
    { id: '3', type: 'input', target: target({ strategy: 'label', value: 'Email address', tagName: 'input', cssSelector: '#email' }), value: "o'brien@example.com", url: 'x', timestamp: at(2000) },
    { id: '4', type: 'input', target: target({ strategy: 'label', value: 'Password', tagName: 'input', cssSelector: '#pw' }), value: '[redacted]', masked: true, url: 'x', timestamp: at(3000) },
    { id: '5', type: 'change', target: target({ strategy: 'role', value: 'combobox', accessibleName: 'Country', tagName: 'select', cssSelector: '#country' }), value: 'Spain', url: 'x', timestamp: at(4000) },
    { id: '6', type: 'change', target: target({ strategy: 'role', value: 'checkbox', accessibleName: 'Save card', tagName: 'input', cssSelector: '#save' }), value: 'true', url: 'x', timestamp: at(5000) },
    { id: '7', type: 'keydown', target: target({ strategy: 'placeholder', value: 'Search products...', tagName: 'input', cssSelector: '#q' }), key: 'Enter', url: 'x', timestamp: at(6000) },
    { id: '8', type: 'click', target: target({ strategy: 'role', value: 'button', accessibleName: truncatedName, tagName: 'button', cssSelector: '.pay' }), url: 'x', timestamp: at(7000) },
    { id: '9', type: 'navigation', target: null, value: 'https://shop.example.com/confirm', url: 'https://shop.example.com/confirm', timestamp: at(8000) },
    { id: '10', type: 'click', target: target({ strategy: 'text', value: 'Retry payment', tagName: 'a', cssSelector: 'a.retry' }), url: 'x', timestamp: at(9000) },
    { id: '11', type: 'submit', target: target({ strategy: 'css', value: 'form#pay', tagName: 'form', cssSelector: 'form#pay' }), url: 'x', timestamp: at(10000) },
  ],
  consoleErrors: [
    { id: 'e1', level: 'error', origin: 'console', message: "TypeError: Cannot read properties of undefined (reading 'total')", stack: 'at checkout.js:42', timestamp: at(7500) },
    { id: 'e2', level: 'unhandledrejection', origin: 'window', message: 'Unhandled promise rejection: Error: payment gateway timeout', source: 'https://shop.example.com/pay.js', lineNumber: 118, timestamp: at(7800) },
  ],
}

const report = generateReport(snapshot)

process.stdout.write('================ MARKDOWN ================\n')
process.stdout.write(report.markdown)
process.stdout.write('\n================ PLAYWRIGHT ================\n')
process.stdout.write(report.playwrightScript)

const DEFAULTS = {
  testTitle: 'Bug Reproduction',
  structure: 'flat',
  selectorPreference: 'auto',
  quoteStyle: 'single',
  includeComments: true,
  includeHeader: true,
  setViewport: true,
  includeConsoleAssertion: true,
  secretEnvVar: 'QA_SNAPPER_SECRET',
}

const VARIANTS = [
  ['defaults', {}],
  ['test.step structure', { structure: 'steps' }],
  ['css selectors forced', { selectorPreference: 'css' }],
  ['role selectors forced', { selectorPreference: 'role' }],
  ['double quotes', { quoteStyle: 'double' }],
  ['minimal output', { includeComments: false, includeHeader: false, setViewport: false, includeConsoleAssertion: false }],
]

function parses(script) {
  const runnable = script
    .replace(/^import .*$/gm, '')
    .replace(/const consoleErrors: string\[\]/, 'const consoleErrors')

  try {
    new Function(`const test = () => {}; test.step = () => {};
      const expect = () => ({ toEqual() {} }); ${runnable}`)
    return null
  } catch (error) {
    return error.message
  }
}

process.stdout.write('\n================ VARIANTS ================\n')

let failed = false

for (const [name, overrides] of VARIANTS) {
  const script = generatePlaywrightScript(snapshot, { ...DEFAULTS, ...overrides })
  const error = parses(script)

  process.stdout.write(`${error ? 'FAIL' : 'ok  '}  ${name.padEnd(22)} ${script.split('\n').length} lines\n`)

  if (error) {
    failed = true
    process.stdout.write(`      ${error}\n`)
  }
}

const stepsSample = generatePlaywrightScript(snapshot, { ...DEFAULTS, structure: 'steps' })
process.stdout.write('\n--- test.step sample ---\n')
process.stdout.write(stepsSample.split('\n').slice(0, 24).join('\n') + '\n')

if (failed) {
  process.exitCode = 1
} else {
  process.stdout.write('\nSYNTAX CHECK: every variant parses as valid JavaScript\n')
}
