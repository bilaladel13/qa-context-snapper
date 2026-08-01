import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-locator')

await build({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(ROOT, 'src/content/locator.ts'),
      formats: ['es'],
      fileName: () => 'locator.js',
    },
  },
  resolve: { alias: { '@': resolve(ROOT, 'src') } },
})

// jsdom does not implement CSS.escape. Chrome does, so this only stands in for
// the harness and never ships.
const cssShim = {
  escape: (value) =>
    String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`),
}

function mountDom(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)

  // locator.ts reads these off the global scope exactly as it would in a page.
  global.window = dom.window
  global.document = dom.window.document
  global.CSS = dom.window.CSS ?? cssShim
  global.Element = dom.window.Element

  return dom.window.document
}

const { resolveTarget } = await import(pathToFileURL(resolve(OUT, 'locator.js')).href)

const results = []

function check(name, condition, detail = '') {
  results.push({ name, passed: Boolean(condition), detail })
}

function candidate(target, strategy) {
  return target.candidates?.[strategy]
}

// A table of identical delete buttons, the case that triggers a strict mode
// violation in real projects.
{
  const doc = mountDom(`
    <table>
      <tr><td><button data-testid="delete-btn">Delete</button></td></tr>
      <tr><td><button data-testid="delete-btn">Delete</button></td></tr>
      <tr><td><button data-testid="delete-btn">Delete</button></td></tr>
    </table>
    <button data-testid="confirm-btn">Confirm</button>
  `)

  const buttons = doc.querySelectorAll('[data-testid="delete-btn"]')

  const first = resolveTarget(buttons[0])
  const third = resolveTarget(buttons[2])
  const unique = resolveTarget(doc.querySelector('[data-testid="confirm-btn"]'))

  check('first duplicate test id records nth 0', candidate(first, 'testId')?.nth === 0)
  check('third duplicate test id records nth 2', candidate(third, 'testId')?.nth === 2)
  check('duplicate test id records the total', candidate(third, 'testId')?.total === 3)
  check('unique test id records no nth', candidate(unique, 'testId')?.nth === undefined)
  check(
    'duplicate role and name also indexed',
    candidate(third, 'role')?.nth === 2,
    `got ${JSON.stringify(candidate(third, 'role'))}`,
  )
}

// The css fallback already disambiguates itself, so it must not gain an index.
{
  const doc = mountDom(`
    <ul>
      <li><span class="tag">Beta</span></li>
      <li><span class="tag">Beta</span></li>
    </ul>
  `)

  const second = resolveTarget(doc.querySelectorAll('.tag')[1])

  check('generated css selector stays unique', candidate(second, 'css')?.nth === undefined)
  check(
    'duplicate visible text is indexed',
    candidate(second, 'text')?.nth === 1,
    `got ${JSON.stringify(candidate(second, 'text'))}`,
  )
}

// Playwright's text engine resolves to the smallest element containing the
// text, so a wrapping ancestor must not inflate the count.
{
  const doc = mountDom(`<div id="outer"><span id="inner">Retry payment</span></div>`)

  const inner = resolveTarget(doc.querySelector('#inner'))

  check(
    'ancestor does not inflate the text count',
    candidate(inner, 'text')?.nth === undefined,
    `got ${JSON.stringify(candidate(inner, 'text'))}`,
  )
}

// Placeholders and labels use substring matching, matching Playwright defaults.
{
  const doc = mountDom(`
    <input placeholder="Search products" />
    <input placeholder="Search products" />
    <label for="a">Email address</label><input id="a" />
    <label for="b">Email address</label><input id="b" />
  `)

  const inputs = doc.querySelectorAll('[placeholder="Search products"]')
  const second = resolveTarget(inputs[1])
  const labelled = resolveTarget(doc.querySelector('#b'))

  check('duplicate placeholder is indexed', candidate(second, 'placeholder')?.nth === 1)
  check(
    'duplicate label is indexed',
    candidate(labelled, 'label')?.nth === 1,
    `got ${JSON.stringify(candidate(labelled, 'label'))}`,
  )
}

// A custom test id attribute must be the one queried when counting.
{
  const doc = mountDom(`
    <button data-qa="row-action">One</button>
    <button data-qa="row-action">Two</button>
  `)

  const second = resolveTarget(doc.querySelectorAll('[data-qa="row-action"]')[1])

  check('non default test id attribute is recorded', second.testIdAttribute === 'data-qa')
  check('non default test id attribute is counted', candidate(second, 'testId')?.nth === 1)
}

// Values containing quotes must not break the attribute selector used to count.
{
  const doc = mountDom(`
    <button data-testid='say "hi"'>A</button>
    <button data-testid='say "hi"'>B</button>
  `)

  const second = resolveTarget(doc.querySelectorAll('button')[1])

  check(
    'quoted test id value is escaped when counting',
    candidate(second, 'testId')?.nth === 1,
    `got ${JSON.stringify(candidate(second, 'testId'))}`,
  )
}

const failures = results.filter((entry) => !entry.passed)

for (const entry of results) {
  process.stdout.write(`${entry.passed ? 'ok  ' : 'FAIL'}  ${entry.name}\n`)
  if (!entry.passed && entry.detail) {
    process.stdout.write(`      ${entry.detail}\n`)
  }
}

if (failures.length > 0) {
  process.stdout.write(`\nlocator verification FAILED (${failures.length})\n`)
  process.exit(1)
}

process.stdout.write(`\nlocator verified: ${results.length} checks\n`)
