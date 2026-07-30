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

const { generateReport } = await import(pathToFileURL(resolve(OUT, 'generator.js')).href)

const started = Date.parse('2026-07-30T10:00:00.000Z')
const at = (offset) => started + offset

const target = (over) => ({ strategy: 'css', value: '', tagName: 'div', cssSelector: 'div', ...over })

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

const runnable = report.playwrightScript
  .replace(/^import .*$/gm, '')
  .replace(/const consoleErrors: string\[\]/, 'const consoleErrors')

try {
  new Function(`const test = () => {}; const expect = () => ({ toEqual() {} }); ${runnable}`)
  process.stdout.write('\nSYNTAX CHECK: the generated script parses as valid JavaScript\n')
} catch (error) {
  process.stdout.write(`\nSYNTAX CHECK FAILED: ${error.message}\n`)
  process.exitCode = 1
}
