import type { ElementTarget } from '@/types'

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy']

export const MAX_TEXT_LENGTH = 80
const MAX_SELECTOR_DEPTH = 6

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
}

export function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function testId(element: Element): string | null {
  for (const attribute of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value) {
      return value
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
  try {
    return document.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
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

export function resolveTarget(element: Element): ElementTarget {
  const cssSelector = buildCssSelector(element)
  const tagName = element.tagName.toLowerCase()
  const role = implicitRole(element) ?? undefined
  const name = accessibleName(element)
  const textSnippet = truncate(collapse(element.textContent), MAX_TEXT_LENGTH) || undefined

  const base = {
    tagName,
    cssSelector,
    role,
    accessibleName: name || undefined,
    textSnippet,
  }

  const id = testId(element)
  if (id) {
    return { ...base, strategy: 'testId', value: id }
  }

  if (role && name) {
    return { ...base, strategy: 'role', value: role }
  }

  const label = labelText(element)
  if (label) {
    return { ...base, strategy: 'label', value: label }
  }

  const placeholder = collapse(element.getAttribute('placeholder'))
  if (placeholder) {
    return { ...base, strategy: 'placeholder', value: placeholder }
  }

  if (textSnippet) {
    return { ...base, strategy: 'text', value: textSnippet }
  }

  return { ...base, strategy: 'css', value: cssSelector }
}
