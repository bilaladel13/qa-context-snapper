import { DEFAULT_SETTINGS, parseTestIdAttributes } from '@/settings/schema'
import { MAX_TEXT_LENGTH } from '@/shared/constants'
import { collapse, looseMatches, trimEllipsis, truncate } from '@/shared/text'
import type {
  ElementTarget,
  LocatorCandidate,
  LocatorCandidates,
  LocatorScope,
  LocatorStrategy,
} from '@/types'

let testIdAttributes = parseTestIdAttributes(DEFAULT_SETTINGS.capture.testIdAttributes)

export function configureTestIdAttributes(attributes: string[]): void {
  testIdAttributes = attributes
}

const MAX_SELECTOR_DEPTH = 6

// Counting text matches means reading textContent for every element, so very
// large pages skip the check and emit a bare locator rather than stalling a click.
const MAX_SCAN_ELEMENTS = 2500

const INPUT_ROLES: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
}

// Only mappings that hold unconditionally. Roles such as banner or region
// depend on where the element sits, and guessing wrong would mean emitting a
// locator that resolves differently in Playwright than it did here.
const TAG_ROLES: Record<string, string> = {
  BUTTON: 'button',
  SELECT: 'combobox',
  TEXTAREA: 'textbox',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  IMG: 'img',
  NAV: 'navigation',
  MAIN: 'main',
  TABLE: 'table',
  FORM: 'form',
  TR: 'row',
  LI: 'listitem',
  UL: 'list',
  OL: 'list',
  TD: 'cell',
  ARTICLE: 'article',
  FIELDSET: 'group',
  DIALOG: 'dialog',
  TBODY: 'rowgroup',
  THEAD: 'rowgroup',
  TFOOT: 'rowgroup',
}

// Containers worth chaining from. A cell or a row identifies a record; a button
// does not contain anything worth scoping to.
const SCOPE_ROLES = new Set([
  'row',
  'listitem',
  'article',
  'group',
  'form',
  'dialog',
  'table',
  'list',
  'rowgroup',
  'cell',
])

const MAX_SCOPE_DEPTH = 6
const MAX_SCOPE_TEXTS = 12
const MAX_SCOPE_DESCENDANTS = 80

// Narrows the element set before the per element role check, so counting never
// walks the whole document for a role query.
const ROLE_SELECTORS: Record<string, string> = {
  button: 'button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]',
  link: 'a[href]',
  checkbox: 'input[type="checkbox"]',
  radio: 'input[type="radio"]',
  textbox:
    'textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"]',
  searchbox: 'input[type="search"]',
  combobox: 'select',
  listbox: 'select[multiple]',
  slider: 'input[type="range"]',
  spinbutton: 'input[type="number"]',
  heading: 'h1, h2, h3, h4, h5, h6',
  img: 'img',
  navigation: 'nav',
  main: 'main',
  table: 'table',
  form: 'form',
  row: 'tr',
  listitem: 'li',
  list: 'ul, ol',
  cell: 'td',
  article: 'article',
  group: 'fieldset',
  dialog: 'dialog',
  rowgroup: 'tbody, thead, tfoot',
}

const LABELLABLE = 'input, select, textarea, [contenteditable="true"], [contenteditable=""]'

function attributeSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

function queryAll(selector: string): Element[] | null {
  try {
    return Array.from(document.querySelectorAll(selector))
  } catch {
    return null
  }
}

function testIdOf(element: Element): { attribute: string; value: string } | null {
  for (const attribute of testIdAttributes) {
    const value = element.getAttribute(attribute)
    if (value) {
      return { attribute, value }
    }
  }
  return null
}

export function implicitRole(element: Element): string | null {
  const explicit = element.getAttribute('role')
  if (explicit) {
    return explicit.split(/\s+/)[0] ?? null
  }

  if (element.tagName === 'A') {
    return element.hasAttribute('href') ? 'link' : null
  }

  if (element.tagName === 'INPUT') {
    const type = (element as HTMLInputElement).type.toLowerCase()
    return INPUT_ROLES[type] ?? null
  }

  if (element.tagName === 'SELECT') {
    return (element as HTMLSelectElement).multiple ? 'listbox' : 'combobox'
  }

  return TAG_ROLES[element.tagName] ?? null
}

function labelText(element: Element): string {
  const id = element.getAttribute('id')

  if (id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (explicit) {
      return collapse(explicit.textContent)
    }
  }

  const wrapping = element.closest('label')
  return wrapping ? collapse(wrapping.textContent) : ''
}

function referencedText(element: Element): string {
  const ids = element.getAttribute('aria-labelledby')
  if (!ids) {
    return ''
  }

  return collapse(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  )
}

export function accessibleName(element: Element): string {
  const ariaLabel = collapse(element.getAttribute('aria-label'))
  if (ariaLabel) {
    return ariaLabel
  }

  const referenced = referencedText(element)
  if (referenced) {
    return referenced
  }

  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement
    if (['button', 'submit', 'reset'].includes(input.type.toLowerCase())) {
      return collapse(input.value)
    }
  }

  const label = labelText(element)
  if (label) {
    return label
  }

  const alt = collapse(element.getAttribute('alt'))
  if (alt) {
    return alt
  }

  const title = collapse(element.getAttribute('title'))
  if (title) {
    return title
  }

  return truncate(collapse(element.textContent), MAX_TEXT_LENGTH)
}

// Only names an author actually wrote. A container's accessible name often
// falls back to its own text content, which for a table row is every cell
// joined together: brittle, and not a name at all for roles that do not take
// their name from content.
function authoredName(element: Element): string {
  const ariaLabel = collapse(element.getAttribute('aria-label'))

  if (ariaLabel) {
    return ariaLabel
  }

  const referenced = referencedText(element)

  return referenced || collapse(element.getAttribute('title'))
}

function isStableToken(token: string): boolean {
  if (!token || token.length > 40) {
    return false
  }
  return !/\d{4,}/.test(token) && !/^[a-z]+-[a-z0-9]{6,}$/i.test(token)
}

function stableClasses(element: Element): string[] {
  return Array.from(element.classList).filter(isStableToken).slice(0, 2)
}

function isUnique(selector: string): boolean {
  return queryAll(selector)?.length === 1
}

function typeIndex(element: Element): number {
  const parent = element.parentElement
  if (!parent) {
    return 0
  }

  const peers = Array.from(parent.children).filter((child) => child.tagName === element.tagName)
  return peers.length > 1 ? peers.indexOf(element) + 1 : 0
}

export function buildCssSelector(element: Element): string {
  const id = element.getAttribute('id')
  if (id && isStableToken(id) && isUnique(`#${CSS.escape(id)}`)) {
    return `#${CSS.escape(id)}`
  }

  const parts: string[] = []
  let current: Element | null = element

  for (let depth = 0; current && depth < MAX_SELECTOR_DEPTH; depth += 1) {
    const currentId = current.getAttribute('id')

    if (currentId && isStableToken(currentId)) {
      parts.unshift(`#${CSS.escape(currentId)}`)
      break
    }

    let part = current.tagName.toLowerCase()
    for (const className of stableClasses(current)) {
      part += `.${CSS.escape(className)}`
    }

    const index = typeIndex(current)
    if (index > 0) {
      part += `:nth-of-type(${index})`
    }

    parts.unshift(part)

    if (isUnique(parts.join(' > '))) {
      break
    }

    current = current.parentElement
  }

  return parts.join(' > ')
}

// Playwright's text engine resolves to the smallest element containing the
// text, so an ancestor that only matches through its descendants is excluded.
function textMatches(value: string): Element[] | null {
  const all = queryAll('body *')

  if (!all || all.length > MAX_SCAN_ELEMENTS) {
    return null
  }

  return all.filter((element) => {
    if (!looseMatches(element.textContent, value)) {
      return false
    }

    return !Array.from(element.children).some((child) => looseMatches(child.textContent, value))
  })
}

function labelMatches(value: string): Element[] | null {
  return (
    queryAll(LABELLABLE)?.filter(
      (element) =>
        looseMatches(labelText(element), value) ||
        looseMatches(element.getAttribute('aria-label'), value),
    ) ?? null
  )
}

function roleMatches(role: string, name: string): Element[] | null {
  const scoped = ROLE_SELECTORS[role]
  const selector = scoped
    ? `${scoped}, ${attributeSelector('role', role)}`
    : attributeSelector('role', role)

  const candidates = queryAll(selector)

  if (!candidates) {
    return null
  }

  return candidates.filter((element) => {
    if (implicitRole(element) !== role) {
      return false
    }

    return name === '' || looseMatches(accessibleName(element), name)
  })
}

// Emulates what the emitted locator will actually resolve to in the browser, so
// the recorded index matches Playwright's own ordering.
function matchesFor(
  strategy: LocatorStrategy,
  value: string,
  context: { name: string; testIdAttribute: string | null },
): Element[] | null {
  switch (strategy) {
    case 'testId':
      return context.testIdAttribute
        ? queryAll(attributeSelector(context.testIdAttribute, value))
        : null
    case 'role':
      return roleMatches(value, trimEllipsis(context.name))
    case 'label':
      return labelMatches(trimEllipsis(value))
    case 'placeholder':
      return (
        queryAll('[placeholder]')?.filter((element) =>
          looseMatches(element.getAttribute('placeholder'), trimEllipsis(value)),
        ) ?? null
      )
    case 'text':
      return textMatches(trimEllipsis(value))
    case 'css':
      return queryAll(value)
  }
}

// Text held by a container that might tell it apart from its siblings. Leaf
// elements only, because a wrapper's text is just its children concatenated.
function distinctiveTexts(ancestor: Element): string[] {
  const descendants = Array.from(ancestor.querySelectorAll('*')).slice(0, MAX_SCOPE_DESCENDANTS)
  const seen = new Set<string>()
  const texts: string[] = []

  for (const element of descendants) {
    if (element.children.length > 0) {
      continue
    }

    const text = collapse(element.textContent)

    if (text.length < 2 || text.length > MAX_TEXT_LENGTH || seen.has(text)) {
      continue
    }

    seen.add(text)
    texts.push(text)

    if (texts.length >= MAX_SCOPE_TEXTS) {
      break
    }
  }

  return texts
}

// Describes an ancestor only if that description resolves to it alone. Peers are
// resolved once and then filtered in memory, so trying many texts stays cheap.
function scopeDescriptor(ancestor: Element): LocatorScope | null {
  const identifier = testIdOf(ancestor)

  if (identifier) {
    const matches = queryAll(attributeSelector(identifier.attribute, identifier.value))

    if (matches?.length === 1) {
      return { strategy: 'testId', value: identifier.value }
    }
  }

  const domId = ancestor.getAttribute('id')

  if (domId && isStableToken(domId) && isUnique(`#${CSS.escape(domId)}`)) {
    return { strategy: 'css', value: `#${CSS.escape(domId)}` }
  }

  const role = implicitRole(ancestor)

  if (!role || !SCOPE_ROLES.has(role)) {
    return null
  }

  const peers = roleMatches(role, '')

  if (!peers || peers.length === 0) {
    return null
  }

  if (peers.length === 1) {
    return { strategy: 'role', value: role }
  }

  const name = trimEllipsis(authoredName(ancestor))

  // Peers are still compared on their full accessible name, because that is
  // what Playwright resolves the name option against.
  if (name && peers.filter((peer) => looseMatches(accessibleName(peer), name)).length === 1) {
    return { strategy: 'role', value: role, accessibleName: name }
  }

  for (const text of distinctiveTexts(ancestor)) {
    if (peers.filter((peer) => looseMatches(peer.textContent, text)).length === 1) {
      return { strategy: 'role', value: role, hasText: text }
    }
  }

  return null
}

// Walks outward for the nearest ancestor that both narrows the matches to this
// one element and can be named. Containment only grows going up, so once an
// ancestor holds more than one match no further ancestor can help.
function findScope(element: Element, matches: Element[]): LocatorScope | null {
  let current = element.parentElement

  for (let depth = 0; current && depth < MAX_SCOPE_DEPTH; depth += 1) {
    const inside = matches.filter((match) => current?.contains(match))

    if (inside.length > 1) {
      return null
    }

    if (inside.length === 1 && inside[0] === element) {
      const descriptor = scopeDescriptor(current)

      if (descriptor) {
        return descriptor
      }
    }

    current = current.parentElement
  }

  return null
}

function distinguishingText(element: Element, matches: Element[]): string | undefined {
  const text = trimEllipsis(truncate(collapse(element.textContent), MAX_TEXT_LENGTH))

  if (text.length < 2) {
    return undefined
  }

  return matches.filter((match) => looseMatches(match.textContent, text)).length === 1
    ? text
    : undefined
}

// Ambiguity is resolved by identity where possible and by position only as a
// last resort, since an index assumes the list never changes.
function describeCandidate(
  element: Element,
  strategy: LocatorStrategy,
  value: string,
  context: { name: string; testIdAttribute: string | null },
): LocatorCandidate {
  const matches = matchesFor(strategy, value, context)

  if (!matches || matches.length <= 1) {
    return { value }
  }

  const nth = matches.indexOf(element)

  // A negative index means the emulation disagrees with the real DOM, so
  // nothing derived from these matches can be trusted. A bare locator beats a
  // wrong disambiguator.
  if (nth < 0) {
    return { value }
  }

  // total is kept whichever way the ambiguity is resolved, because a count
  // assertion is about the unnarrowed set.
  const total = matches.length
  const hasText = distinguishingText(element, matches)

  if (hasText) {
    return { value, hasText, total }
  }

  const scope = findScope(element, matches)

  return scope ? { value, scope, total } : { value, nth, total }
}

// Ordered by how resilient the resulting Playwright locator is to markup churn.
export const STRATEGY_ORDER = ['testId', 'role', 'label', 'placeholder', 'text', 'css'] as const

export function resolveTarget(element: Element): ElementTarget {
  const cssSelector = buildCssSelector(element)
  const role = implicitRole(element) ?? undefined
  const name = accessibleName(element)
  const textSnippet = truncate(collapse(element.textContent), MAX_TEXT_LENGTH) || undefined
  const identifier = testIdOf(element)

  const context = { name, testIdAttribute: identifier?.attribute ?? null }
  const raw: Partial<Record<LocatorStrategy, string>> = { css: cssSelector }

  if (identifier) raw.testId = identifier.value
  if (role && name) raw.role = role

  const label = labelText(element)
  if (label) raw.label = label

  const placeholder = collapse(element.getAttribute('placeholder'))
  if (placeholder) raw.placeholder = placeholder

  if (textSnippet) raw.text = textSnippet

  const candidates: LocatorCandidates = {}
  for (const [strategy, value] of Object.entries(raw) as [LocatorStrategy, string][]) {
    candidates[strategy] = describeCandidate(element, strategy, value, context)
  }

  const strategy = STRATEGY_ORDER.find((option) => candidates[option] !== undefined) ?? 'css'

  return {
    strategy,
    value: candidates[strategy]?.value ?? cssSelector,
    tagName: element.tagName.toLowerCase(),
    cssSelector,
    role,
    accessibleName: name || undefined,
    textSnippet,
    testIdAttribute: identifier?.attribute,
    candidates,
  }
}
