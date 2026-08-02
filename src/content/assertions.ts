import { collapse, truncate } from '@/shared/text'
import type { AssertionDetail, AssertionKind, ElementTarget } from '@/types'

const MAX_EXPECTED_LENGTH = 160

// Attributes worth asserting on. Anything volatile such as class or style is
// left out because it produces tests that break on unrelated styling changes.
const ASSERTABLE_ATTRIBUTES = [
  'aria-invalid',
  'aria-expanded',
  'aria-selected',
  'aria-checked',
  'aria-disabled',
  'aria-current',
  'aria-label',
  'href',
  'src',
  'alt',
  'title',
  'type',
  'role',
  'target',
  'data-state',
]

const TEXT_HOSTILE_TAGS = new Set(['HTML', 'BODY', 'MAIN', 'NAV', 'HEADER', 'FOOTER', 'SECTION'])

export interface AssertionOption {
  kind: AssertionKind
  label: string
  expected?: string
  attribute?: string
  // Whether the expected value should be editable before it is recorded.
  editable: boolean
}

export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect()

  if (rect.width === 0 && rect.height === 0) {
    return false
  }

  const style = getComputedStyle(element)

  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function asFormControl(element: Element): FormControl | null {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
    ? element
    : null
}

function isToggle(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
}

function supportsDisabled(element: Element): boolean {
  return (
    asFormControl(element) !== null ||
    element instanceof HTMLButtonElement ||
    element.hasAttribute('aria-disabled')
  )
}

function isDisabled(element: Element): boolean {
  const control = asFormControl(element)

  if (control?.disabled || (element as HTMLButtonElement).disabled) {
    return true
  }

  return element.getAttribute('aria-disabled') === 'true'
}

function readableText(element: Element): string {
  if (TEXT_HOSTILE_TAGS.has(element.tagName)) {
    return ''
  }

  return truncate(collapse(element.textContent), MAX_EXPECTED_LENGTH)
}

function matchCount(target: ElementTarget): number {
  const candidate = target.candidates?.[target.strategy]
  return candidate?.total ?? 1
}

// Everything offered is read straight off the element, so the expected value is
// whatever the page is showing at the moment the assertion is captured.
export function suggestAssertions(element: Element, target: ElementTarget): AssertionOption[] {
  const options: AssertionOption[] = []
  const visible = isElementVisible(element)

  options.push(
    visible
      ? { kind: 'visible', label: 'Is visible', editable: false }
      : { kind: 'hidden', label: 'Is hidden', editable: false },
  )

  options.push(
    visible
      ? { kind: 'hidden', label: 'Is hidden', editable: false }
      : { kind: 'visible', label: 'Is visible', editable: false },
  )

  const text = readableText(element)

  if (text) {
    options.push({ kind: 'text', label: 'Contains text', expected: text, editable: true })
    options.push({ kind: 'exactText', label: 'Has exact text', expected: text, editable: true })
  }

  const control = asFormControl(element)

  if (control && !isToggle(element)) {
    options.push({
      kind: 'value',
      label: 'Has value',
      expected: truncate(control.value, MAX_EXPECTED_LENGTH),
      editable: true,
    })
  }

  if (isToggle(element)) {
    options.push(
      element.checked
        ? { kind: 'checked', label: 'Is checked', editable: false }
        : { kind: 'unchecked', label: 'Is not checked', editable: false },
    )
  }

  if (supportsDisabled(element)) {
    options.push(
      isDisabled(element)
        ? { kind: 'disabled', label: 'Is disabled', editable: false }
        : { kind: 'enabled', label: 'Is enabled', editable: false },
    )
  }

  const total = matchCount(target)

  if (total > 1) {
    options.push({
      kind: 'count',
      label: 'Matches count',
      expected: String(total),
      editable: true,
    })
  }

  for (const attribute of ASSERTABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute)

    if (value !== null && value !== '') {
      options.push({
        kind: 'attribute',
        label: `Attribute ${attribute}`,
        attribute,
        expected: truncate(value, MAX_EXPECTED_LENGTH),
        editable: true,
      })
    }
  }

  return options
}

export function pageAssertions(): AssertionOption[] {
  return [
    { kind: 'url', label: 'Page URL is', expected: location.href, editable: true },
    { kind: 'title', label: 'Page title is', expected: document.title, editable: true },
  ]
}

export const MAX_MESSAGE_LENGTH = 200

export function toDetail(
  option: AssertionOption,
  expected: string,
  message: string,
): AssertionDetail {
  const reason = message.trim().slice(0, MAX_MESSAGE_LENGTH)

  return {
    kind: option.kind,
    ...(option.editable ? { expected } : {}),
    ...(option.attribute ? { attribute: option.attribute } : {}),
    ...(reason ? { message: reason } : {}),
  }
}
