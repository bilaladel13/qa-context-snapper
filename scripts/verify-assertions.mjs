import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-assertions')

await build({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(ROOT, 'src/content/assertions.ts'),
      formats: ['es'],
      fileName: () => 'assertions.js',
    },
  },
  resolve: { alias: { '@': resolve(ROOT, 'src') } },
})

function mountDom(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)

  // jsdom has no layout, so every rect is zero and everything would look
  // hidden. Elements opt into being invisible with data-offscreen.
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const empty = this.hasAttribute('data-offscreen')
    return empty
      ? { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
      : { width: 120, height: 24, top: 10, left: 10, right: 130, bottom: 34 }
  }

  global.window = dom.window
  global.document = dom.window.document
  global.Element = dom.window.Element
  global.HTMLInputElement = dom.window.HTMLInputElement
  global.HTMLSelectElement = dom.window.HTMLSelectElement
  global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement
  global.HTMLButtonElement = dom.window.HTMLButtonElement
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)

  return dom.window.document
}

const { suggestAssertions } = await import(pathToFileURL(resolve(OUT, 'assertions.js')).href)

const results = []
const check = (name, passed, detail = '') => results.push({ name, passed: Boolean(passed), detail })

const target = (over = {}) => ({
  strategy: 'css',
  value: 'x',
  tagName: 'div',
  cssSelector: 'x',
  candidates: { css: { value: 'x' } },
  ...over,
})

const kinds = (element, over) => suggestAssertions(element, target(over)).map((option) => option.kind)

// A validation message that appeared: the classic silent bug with no console error.
{
  const doc = mountDom(`<p role="alert" id="msg">Enter a valid email address</p>`)
  const options = suggestAssertions(doc.querySelector('#msg'), target())

  check('visible element offers visible first', options[0].kind === 'visible')
  check('offers the inverse as well', options.some((option) => option.kind === 'hidden'))

  const text = options.find((option) => option.kind === 'exactText')
  check('exact text is prefilled from the page', text?.expected === 'Enter a valid email address')
  check('text assertions are editable', text?.editable === true)
}

// A hidden element offers the hidden assertion first.
{
  const doc = mountDom(`<div id="toast" data-offscreen>Saved</div>`)
  const options = suggestAssertions(doc.querySelector('#toast'), target())

  check('hidden element offers hidden first', options[0].kind === 'hidden')
}

{
  const doc = mountDom(`<div id="wrap" style="display:none">Gone</div>`)
  const options = suggestAssertions(doc.querySelector('#wrap'), target())

  check('display none counts as hidden', options[0].kind === 'hidden')
}

// Form controls.
{
  const doc = mountDom(`
    <input id="email" value="not-an-email" />
    <button id="submit" disabled>Submit</button>
    <button id="go">Go</button>
    <input id="terms" type="checkbox" checked />
    <input id="news" type="checkbox" />
  `)

  const email = suggestAssertions(doc.querySelector('#email'), target())
  const value = email.find((option) => option.kind === 'value')

  check('inputs offer a value assertion', value?.expected === 'not-an-email')
  check('inputs offer an enabled state', email.some((option) => option.kind === 'enabled'))

  check('disabled button offers disabled', kinds(doc.querySelector('#submit')).includes('disabled'))
  check('enabled button offers enabled', kinds(doc.querySelector('#go')).includes('enabled'))
  check('checked box offers checked', kinds(doc.querySelector('#terms')).includes('checked'))
  check('unchecked box offers unchecked', kinds(doc.querySelector('#news')).includes('unchecked'))
  check(
    'checkboxes do not offer a text value',
    !kinds(doc.querySelector('#terms')).includes('value'),
  )
}

// aria-disabled is how component libraries express a disabled control.
{
  const doc = mountDom(`<div id="fake" role="button" aria-disabled="true">Pay</div>`)
  const options = kinds(doc.querySelector('#fake'))

  check('aria-disabled is recognised', options.includes('disabled'))
  check('aria attributes are assertable', options.includes('attribute'))
}

// Attributes worth asserting, and ones that are not.
{
  const doc = mountDom(
    `<a id="link" href="/checkout" class="btn btn-primary" style="color:red" aria-invalid="true">Pay</a>`,
  )
  const options = suggestAssertions(doc.querySelector('#link'), target())
  const attributes = options.filter((option) => option.kind === 'attribute').map((o) => o.attribute)

  check('href is assertable', attributes.includes('href'))
  check('aria-invalid is assertable', attributes.includes('aria-invalid'))
  check('class is never assertable', !attributes.includes('class'))
  check('style is never assertable', !attributes.includes('style'))
}

// Count only appears when the locator really matches several elements.
{
  const doc = mountDom(`<li id="row">Row</li>`)
  const single = kinds(doc.querySelector('#row'))
  const many = kinds(doc.querySelector('#row'), {
    candidates: { css: { value: 'li', nth: 1, total: 4 } },
  })

  check('single match offers no count', !single.includes('count'))
  check('multiple matches offer a count', many.includes('count'))

  const count = suggestAssertions(doc.querySelector('#row'), {
    ...target(),
    candidates: { css: { value: 'li', nth: 1, total: 4 } },
  }).find((option) => option.kind === 'count')

  check('count is prefilled from the match total', count?.expected === '4')
}

// Structural containers should not offer their entire subtree as text.
{
  const doc = mountDom(`<body><main id="main"><p>Lots of text here</p></main></body>`)

  check(
    'containers do not offer a text assertion',
    !kinds(doc.querySelector('#main')).includes('text'),
  )
}

for (const entry of results) {
  process.stdout.write(`${entry.passed ? 'ok  ' : 'FAIL'}  ${entry.name}\n`)
  if (!entry.passed && entry.detail) {
    process.stdout.write(`      ${entry.detail}\n`)
  }
}

const failures = results.filter((entry) => !entry.passed)

if (failures.length > 0) {
  process.stdout.write(`\nassertion suggestions FAILED (${failures.length})\n`)
  process.exit(1)
}

process.stdout.write(`\nassertion suggestions verified: ${results.length} checks\n`)
