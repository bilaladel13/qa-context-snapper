import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-jira')

await build({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    lib: { entry: resolve(ROOT, 'src/jira/adf.ts'), formats: ['es'], fileName: () => 'adf.js' },
  },
  resolve: { alias: { '@': resolve(ROOT, 'src') } },
})

const { buildDescription, suggestSummary } = await import(
  pathToFileURL(resolve(OUT, 'adf.js')).href
)

const started = Date.parse('2026-07-30T10:00:00.000Z')

const snapshot = {
  sessionId: 'jira',
  startedAt: started,
  stoppedAt: started + 95_000,
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.7390.55',
    os: 'Windows 11',
    screenSize: '2560x1440',
    viewportSize: '1280x720',
    devicePixelRatio: 1.5,
    language: 'en-US',
    userAgent: 'Mozilla/5.0',
    pageUrl: 'https://shop.example.com/cart',
    pageTitle: "Cart | Bob's Shop",
    capturedAt: '2026-07-30T10:00:00.000Z',
  },
  interactions: [
    { id: '1', type: 'navigation', target: null, value: 'https://shop.example.com/cart', url: 'x', timestamp: started },
    {
      id: '2',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'checkout-btn',
        tagName: 'button',
        cssSelector: '#co',
        candidates: { testId: { value: 'checkout-btn' } },
      },
      url: 'x',
      timestamp: started + 1000,
    },
  ],
  consoleErrors: [
    {
      id: 'e1',
      level: 'error',
      origin: 'console',
      message: "TypeError: Cannot read properties of undefined (reading 'total')",
      source: 'https://shop.example.com/checkout.js',
      lineNumber: 42,
      timestamp: started + 7500,
    },
  ],
}

const results = []
const check = (name, passed, detail = '') => results.push({ name, passed: Boolean(passed), detail })

// Jira rejects a text node holding an empty string, and the resulting API error
// does not say which node caused it.
function findProblems(node, path = 'doc') {
  const problems = []

  if (node.type === 'text' && (typeof node.text !== 'string' || node.text.length === 0)) {
    problems.push(`${path}: empty text node`)
  }

  if (node.type === 'codeBlock' && !node.attrs?.language) {
    problems.push(`${path}: codeBlock without a language`)
  }

  if (node.type === 'tableRow') {
    const cells = node.content ?? []
    if (cells.length === 0) problems.push(`${path}: empty table row`)
  }

  for (const [index, child] of (node.content ?? []).entries()) {
    problems.push(...findProblems(child, `${path}.${node.type}[${index}]`))
  }

  return problems
}

const script = "import { test } from '@playwright/test';\n\ntest('x', async ({ page }) => {});\n"
const full = buildDescription(snapshot, { playwrightScript: script })

check('document is an adf doc', full.type === 'doc' && full.version === 1)
check('no structural problems', findProblems(full).length === 0, findProblems(full).join('; '))

const flat = JSON.stringify(full)

check('environment table is present', flat.includes('tableHeader') && flat.includes('Windows 11'))
check('steps are an ordered list', flat.includes('orderedList'))
check('console error is included', flat.includes('Cannot read properties of undefined'))
check('playwright block is typescript', flat.includes('"language":"typescript"'))
check('playwright source is embedded', flat.includes('@playwright/test'))

const withoutScript = buildDescription(snapshot, { playwrightScript: null })
check('script can be omitted', !JSON.stringify(withoutScript).includes('@playwright/test'))
check('omitting the script stays valid', findProblems(withoutScript).length === 0)

const withoutConsole = buildDescription(snapshot, {
  playwrightScript: null,
  includeConsoleErrors: false,
})
check(
  'console output can be omitted',
  !JSON.stringify(withoutConsole).includes('Cannot read properties of undefined'),
)

// An empty recording must still produce a document Jira will accept.
const empty = buildDescription(
  { ...snapshot, interactions: [], consoleErrors: [] },
  { playwrightScript: null },
)
check('empty recording stays valid', findProblems(empty).length === 0, findProblems(empty).join('; '))

const longScript = 'a'.repeat(40_000)
const truncated = buildDescription(snapshot, { playwrightScript: longScript })
check('oversized script is truncated', JSON.stringify(truncated).includes('... truncated'))

const summary = suggestSummary(snapshot)
check('summary combines page and error', summary.startsWith("Cart | Bob's Shop: TypeError"))
check('summary fits the jira limit', summary.length <= 255)

const longSummary = suggestSummary({
  ...snapshot,
  consoleErrors: [{ ...snapshot.consoleErrors[0], message: 'x'.repeat(500) }],
})
check('long summary is clipped to 255', longSummary.length === 255)

for (const entry of results) {
  process.stdout.write(`${entry.passed ? 'ok  ' : 'FAIL'}  ${entry.name}\n`)
  if (!entry.passed && entry.detail) {
    process.stdout.write(`      ${entry.detail}\n`)
  }
}

const failures = results.filter((entry) => !entry.passed)

if (failures.length > 0) {
  process.stdout.write(`\njira verification FAILED (${failures.length})\n`)
  process.exit(1)
}

process.stdout.write(`\njira description verified: ${results.length} checks\n`)
