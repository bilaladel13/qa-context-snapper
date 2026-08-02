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

// A custom test id attribute must be the one queried when counting. The labels
// are identical so nothing but position can tell them apart.
{
  const doc = mountDom(`
    <button data-qa="row-action">Act</button>
    <button data-qa="row-action">Act</button>
  `)

  const second = resolveTarget(doc.querySelectorAll('[data-qa="row-action"]')[1])

  check('non default test id attribute is recorded', second.testIdAttribute === 'data-qa')
  check('non default test id attribute is counted', candidate(second, 'testId')?.nth === 1)
}

// Distinct labels are identity, so position is not needed at all.
{
  const doc = mountDom(`
    <button data-qa="row-action">One</button>
    <button data-qa="row-action">Two</button>
  `)

  const second = candidate(resolveTarget(doc.querySelectorAll('[data-qa="row-action"]')[1]), 'testId')

  check('distinct labels are preferred over position', second?.hasText === 'Two')
  check('distinct labels leave no index', second?.nth === undefined)
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

// A members table: the case where .nth() is worst, because adding or removing a
// row silently repoints every index.
{
  const doc = mountDom(`
    <table id="members">
      <tbody>
        <tr>
          <td data-testid="member-email">mohammed@example.com</td>
          <td><button data-testid="remove">Remove</button></td>
        </tr>
        <tr>
          <td data-testid="member-email">sara@example.com</td>
          <td><button data-testid="remove">Remove</button></td>
        </tr>
        <tr>
          <td data-testid="member-email">omar@example.com</td>
          <td><button data-testid="remove">Remove</button></td>
        </tr>
      </tbody>
    </table>
  `)

  const emails = doc.querySelectorAll('[data-testid="member-email"]')
  const buttons = doc.querySelectorAll('[data-testid="remove"]')

  // The cell carries its own identity, so its text is enough.
  const email = candidate(resolveTarget(emails[1]), 'testId')

  check('a cell with unique text uses hasText', email?.hasText === 'sara@example.com')
  check('a cell with unique text drops nth', email?.nth === undefined)
  check('the unnarrowed total is still recorded', email?.total === 3)

  // Every Remove button reads the same, so identity has to come from the row.
  const button = candidate(resolveTarget(buttons[2]), 'testId')

  check('an identical button falls back to scoping', button?.scope !== undefined, JSON.stringify(button))
  check('the scope is the row', button?.scope?.value === 'row')
  check(
    'the row is identified by its content',
    button?.scope?.hasText === 'omar@example.com',
    JSON.stringify(button?.scope),
  )
  check('a scoped locator needs no index', button?.nth === undefined)
}

// Nothing distinguishes these, so a positional index is the honest answer.
{
  const doc = mountDom(`
    <div><span data-testid="dot"></span></div>
    <div><span data-testid="dot"></span></div>
    <div><span data-testid="dot"></span></div>
  `)

  const dot = candidate(resolveTarget(doc.querySelectorAll('[data-testid="dot"]')[2]), 'testId')

  check('indistinguishable elements still use nth', dot?.nth === 2)
  check('nth records the total', dot?.total === 3)
}

// A uniquely identified container is preferred over inventing text for it.
{
  const doc = mountDom(`
    <section data-testid="billing"><button data-testid="save">Save</button></section>
    <section data-testid="shipping"><button data-testid="save">Save</button></section>
  `)

  const save = candidate(resolveTarget(doc.querySelectorAll('[data-testid="save"]')[1]), 'testId')

  check('a container test id becomes the scope', save?.scope?.strategy === 'testId')
  check('the scope names the container', save?.scope?.value === 'shipping')
}

// A list item identified by its own accessible name rather than by position.
{
  const doc = mountDom(`
    <ul>
      <li aria-label="Invoice 1001"><a href="#">Download</a></li>
      <li aria-label="Invoice 1002"><a href="#">Download</a></li>
    </ul>
  `)

  const link = candidate(resolveTarget(doc.querySelectorAll('a')[1]), 'role')

  check('list items scope by accessible name', link?.scope?.accessibleName === 'Invoice 1002')
  check('the list item is the scope', link?.scope?.value === 'listitem')
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
