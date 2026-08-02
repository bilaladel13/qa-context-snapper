import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-preview')

// --quiet keeps the sample output out of the verify run; the checks still fail loudly.
const QUIET = process.argv.includes('--quiet')
const show = (text) => {
  if (!QUIET) process.stdout.write(text)
}

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
  const { nth, ...merged } = {
    strategy: 'css',
    value: '',
    tagName: 'div',
    cssSelector: 'div',
    ...over,
  }

  return {
    ...merged,
    candidates: {
      css: { value: merged.cssSelector },
      ...(merged.accessibleName ? { text: { value: merged.accessibleName } } : {}),
      [merged.strategy]: {
        value: merged.value,
        ...(nth === undefined ? {} : { nth, total: nth + 2 }),
      },
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

show('================ MARKDOWN ================\n')
show(report.markdown)
show('\n================ PLAYWRIGHT ================\n')
show(report.playwrightScript)

const DEFAULTS = {
  testTitle: 'Bug Reproduction',
  structure: 'flat',
  selectorPreference: 'auto',
  quoteStyle: 'single',
  includeComments: true,
  includeHeader: true,
  setViewport: true,
  includeConsoleAssertion: true,
  useRelativeUrls: true,
  secretEnvVar: 'QA_SNAPPER_SECRET',
}

// A dev server on a random port, a table of identical delete buttons, and a
// hop to a different origin part way through.
const localhostSnapshot = {
  sessionId: 'localhost',
  startedAt: started,
  stoppedAt: at(20_000),
  environment: { ...snapshot.environment, pageUrl: 'http://localhost:5174/dashboard' },
  consoleErrors: [],
  interactions: [
    { id: 'l1', type: 'navigation', target: null, value: 'http://localhost:5174/dashboard', url: 'x', timestamp: at(0) },
    { id: 'l2', type: 'click', target: target({ strategy: 'testId', value: 'delete-btn', nth: 2, tagName: 'button', cssSelector: 'tr:nth-of-type(3) > button' }), url: 'x', timestamp: at(1000) },
    { id: 'l3', type: 'click', target: target({ strategy: 'testId', value: 'confirm-btn', tagName: 'button', cssSelector: '#confirm' }), url: 'x', timestamp: at(2000) },
    { id: 'l4', type: 'navigation', target: null, value: 'http://localhost:5174/dashboard?deleted=1#row-3', url: 'x', timestamp: at(3000) },
    { id: 'l5', type: 'navigation', target: null, value: 'https://auth.example.com/login', url: 'x', timestamp: at(4000) },
  ],
}

const assert = (kind, over = {}, extra = {}) => ({
  id: `a-${kind}`,
  type: 'assertion',
  target: over.target ?? null,
  assertion: { kind, ...extra },
  url: 'x',
  timestamp: at(0),
})

// A silent bug: an invalid email is accepted, nothing is logged, and only an
// assertion can make the generated test fail.
const assertionSnapshot = {
  sessionId: 'assertions',
  startedAt: started,
  stoppedAt: at(30_000),
  environment: { ...snapshot.environment, pageUrl: 'https://shop.example.com/signup' },
  consoleErrors: [],
  interactions: [
    { id: 'n1', type: 'navigation', target: null, value: 'https://shop.example.com/signup', url: 'x', timestamp: at(0) },
    { id: 'i1', type: 'input', target: target({ strategy: 'label', value: 'Email', tagName: 'input', cssSelector: '#email' }), value: 'not-an-email', url: 'x', timestamp: at(1000) },
    assert('visible', { target: target({ strategy: 'role', value: 'alert', accessibleName: 'Enter a valid email', tagName: 'p', cssSelector: '.err' }) }),
    assert('exactText', { target: target({ strategy: 'testId', value: 'error-text', tagName: 'p', cssSelector: '.err' }) }, { expected: 'Enter a valid email address' }),
    assert('disabled', { target: target({ strategy: 'role', value: 'button', accessibleName: 'Continue', tagName: 'button', cssSelector: '#go' }) }),
    assert('unchecked', { target: target({ strategy: 'label', value: 'Newsletter', tagName: 'input', cssSelector: '#news' }) }),
    assert('value', { target: target({ strategy: 'label', value: 'Email', tagName: 'input', cssSelector: '#email' }) }, { expected: 'not-an-email' }),
    assert('attribute', { target: target({ strategy: 'label', value: 'Email', tagName: 'input', cssSelector: '#email' }) }, { attribute: 'aria-invalid', expected: 'true' }),
    assert('hidden', { target: target({ strategy: 'testId', value: 'success-toast', tagName: 'div', cssSelector: '.toast' }) }),
    assert('count', { target: target({ strategy: 'testId', value: 'row', nth: 2, tagName: 'li', cssSelector: 'li' }) }, { expected: '3' }),
    assert('url', {}, { expected: 'https://shop.example.com/signup' }),
    assert('title', {}, { expected: 'Sign up' }),
    assert(
      'hidden',
      { target: target({ strategy: 'testId', value: 'spinner', tagName: 'div', cssSelector: '.spin' }) },
      { message: "the spinner must clear or the form looks stuck" },
    ),
    assert('url', {}, { expected: 'https://shop.example.com/done', message: 'signup should redirect' }),
    assert(
      'count',
      { target: target({ strategy: 'testId', value: 'row', nth: 1, tagName: 'li', cssSelector: 'li' }) },
      { expected: '2', message: "O'Brien's row should be gone" },
    ),
  ],
}

// The pre Phase 5 shape stored candidates as plain strings.
const legacySnapshot = {
  ...localhostSnapshot,
  sessionId: 'legacy',
  interactions: [
    localhostSnapshot.interactions[0],
    {
      id: 'g1',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'delete-btn',
        tagName: 'button',
        cssSelector: 'button',
        candidates: { testId: 'delete-btn', css: 'button' },
      },
      url: 'x',
      timestamp: at(1000),
    },
  ],
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

show('\n================ VARIANTS ================\n')

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
show('\n--- test.step sample ---\n')
show(stepsSample.split('\n').slice(0, 24).join('\n') + '\n')

show('\n================ RESILIENCY ================\n')

const relative = generatePlaywrightScript(localhostSnapshot, DEFAULTS)
const absolute = generatePlaywrightScript(localhostSnapshot, { ...DEFAULTS, useRelativeUrls: false })
const forcedCss = generatePlaywrightScript(localhostSnapshot, {
  ...DEFAULTS,
  selectorPreference: 'css',
})
const legacy = generatePlaywrightScript(legacySnapshot, DEFAULTS)

show('\n--- relative navigation ---\n')
show(relative + '\n')

const checks = [
  ['duplicate test id gets .nth(2)', relative.includes(".getByTestId('delete-btn').nth(2)")],
  ['unique test id stays bare', relative.includes(".getByTestId('confirm-btn').click()")],
  ['start url becomes a path', relative.includes("page.goto('/dashboard')")],
  ['query and hash survive', relative.includes("page.goto('/dashboard?deleted=1#row-3')")],
  ['other origins stay absolute', relative.includes("page.goto('https://auth.example.com/login')")],
  ['baseURL hint is emitted', relative.includes("Set baseURL to 'http://localhost:5174'")],
  ['toggling off keeps the full url', absolute.includes("page.goto('http://localhost:5174/dashboard')")],
  ['toggling off drops the hint', !absolute.includes('Set baseURL')],
  ['forced css ignores the test id index', !forcedCss.includes('.nth(2)')],
  ['legacy string candidates still resolve', legacy.includes(".getByTestId('delete-btn')")],
  ['every resiliency script parses', [relative, absolute, forcedCss, legacy].every((s) => parses(s) === null)],
]

// The locator resilience ladder, as it reaches the emitted script.
const resilientSnapshot = {
  sessionId: 'resilient',
  startedAt: started,
  stoppedAt: at(10_000),
  environment: { ...snapshot.environment, pageUrl: 'https://app.example.com/members' },
  consoleErrors: [],
  interactions: [
    { id: 'r0', type: 'navigation', target: null, value: 'https://app.example.com/members', url: 'x', timestamp: at(0) },
    {
      id: 'r1',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'member-email',
        tagName: 'td',
        cssSelector: 'td',
        candidates: { testId: { value: 'member-email', hasText: 'sara@example.com', total: 3 } },
      },
      url: 'x',
      timestamp: at(1000),
    },
    {
      id: 'r2',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'remove',
        tagName: 'button',
        cssSelector: 'button',
        candidates: {
          testId: {
            value: 'remove',
            total: 3,
            scope: { strategy: 'role', value: 'row', hasText: 'omar@example.com' },
          },
        },
      },
      url: 'x',
      timestamp: at(2000),
    },
    {
      id: 'r3',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'save',
        tagName: 'button',
        cssSelector: 'button',
        candidates: {
          testId: { value: 'save', total: 2, scope: { strategy: 'testId', value: 'shipping' } },
        },
      },
      url: 'x',
      timestamp: at(3000),
    },
    {
      id: 'r4',
      type: 'click',
      target: {
        strategy: 'role',
        value: 'link',
        accessibleName: 'Download',
        tagName: 'a',
        cssSelector: 'a',
        candidates: {
          role: {
            value: 'link',
            total: 2,
            scope: { strategy: 'role', value: 'listitem', accessibleName: 'Invoice 1002' },
          },
        },
      },
      url: 'x',
      timestamp: at(4000),
    },
    {
      id: 'r5',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'dot',
        tagName: 'span',
        cssSelector: 'span',
        candidates: { testId: { value: 'dot', nth: 2, total: 3 } },
      },
      url: 'x',
      timestamp: at(5000),
    },
  ],
}

const resilient = generatePlaywrightScript(resilientSnapshot, DEFAULTS)

show('\n--- resilient locators ---\n')
show(resilient + '\n')

checks.push(
  ['unique text becomes a filter', resilient.includes(".getByTestId('member-email').filter({ hasText: 'sara@example.com' })")],
  ['an identical control chains from its row', resilient.includes("page.getByRole('row').filter({ hasText: 'omar@example.com' }).getByTestId('remove')")],
  ['a container test id becomes the chain root', resilient.includes("page.getByTestId('shipping').getByTestId('save')")],
  ['a named container keeps its name', resilient.includes("page.getByRole('listitem', { name: 'Invoice 1002' }).getByRole('link', { name: 'Download' })")],
  ['position is still available as a last resort', resilient.includes(".getByTestId('dot').nth(2)")],
  ['identity locators never also carry an index', !/filter\(\{ hasText[^)]*\}\)\.nth\(/.test(resilient)],
  ['scoped locators never also carry an index', !/getByTestId\('remove'\)\.nth\(/.test(resilient)],
  ['the resilient script parses', parses(resilient) === null],
)

const asserted = generatePlaywrightScript(assertionSnapshot, DEFAULTS)

show('\n--- assertions ---\n')
show(asserted + '\n')

checks.push(
  ['visible becomes toBeVisible', asserted.includes(".getByRole('alert', { name: 'Enter a valid email' })).toBeVisible()")],
  ['exact text becomes toHaveText', asserted.includes(".getByTestId('error-text')).toHaveText('Enter a valid email address')")],
  ['disabled becomes toBeDisabled', asserted.includes('.toBeDisabled()')],
  ['unchecked becomes not.toBeChecked', asserted.includes('.not.toBeChecked()')],
  ['value becomes toHaveValue', asserted.includes(".toHaveValue('not-an-email')")],
  ['attribute becomes toHaveAttribute', asserted.includes(".toHaveAttribute('aria-invalid', 'true')")],
  ['hidden becomes toBeHidden', asserted.includes('.toBeHidden()')],
  ['count becomes toHaveCount', asserted.includes('.toHaveCount(3)')],
  // A count assertion is about the whole set, so indexing it would always fail.
  ['count never carries an nth', !/nth\(2\)\)\.toHaveCount/.test(asserted)],
  ['url becomes toHaveURL', asserted.includes("await expect(page).toHaveURL('/signup')")],
  ['title becomes toHaveTitle', asserted.includes("await expect(page).toHaveTitle('Sign up')")],
  ['assertions stay in recorded order', asserted.indexOf('toBeVisible') < asserted.indexOf('toHaveCount')],
  ['the assertion script parses', parses(asserted) === null],
  // A custom failure reason, which Playwright takes as expect's second argument.
  ['a reason becomes the expect description', asserted.includes("await expect(page.getByTestId('spinner'), 'the spinner must clear or the form looks stuck').toBeHidden()")],
  ['page level assertions take a reason too', asserted.includes("await expect(page, 'signup should redirect').toHaveURL('/done')")],
  ['a reason survives alongside a count', asserted.includes(".toHaveCount(2)") && asserted.includes("O\\'Brien")],
  ['a quote in the reason is escaped', !/[^\\]'O'Brien/.test(asserted)],
  ['assertions without a reason stay plain', asserted.includes('await expect(page.getByTestId(\'success-toast\')).toBeHidden()')],
)

show('\n')

for (const [name, passed] of checks) {
  process.stdout.write(`${passed ? 'ok  ' : 'FAIL'}  ${name}\n`)
  if (!passed) failed = true
}

if (failed) {
  process.exitCode = 1
} else {
  process.stdout.write('\nALL CHECKS PASSED\n')
}
