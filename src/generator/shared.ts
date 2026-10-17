import type { QuoteStyle, SelectorPreference } from '@/settings/schema'
import { trimEllipsis } from '@/shared/text'
import type {
  ElementTarget,
  InteractionEvent,
  LocatorCandidate,
  LocatorCandidates,
  LocatorScope,
  LocatorStrategy,
} from '@/types'

export { trimEllipsis }

const AUTO_ORDER: LocatorStrategy[] = ['testId', 'role', 'label', 'placeholder', 'text', 'css']

export function quote(value: string, style: QuoteStyle = 'single'): string {
  const delimiter = style === 'double' ? '"' : "'"

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(delimiter, 'g'), `\\${delimiter}`)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')

  return `${delimiter}${escaped}${delimiter}`
}

export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

export interface ResolvedLocator {
  strategy: LocatorStrategy
  value: string
  hasText?: string
  scope?: LocatorScope
  nth?: number
}

function readCandidate(raw: unknown): LocatorCandidate | null {
  if (typeof raw === 'string') {
    return raw === '' ? null : { value: raw }
  }

  const candidate = raw as LocatorCandidate | undefined

  return candidate && typeof candidate.value === 'string' && candidate.value !== ''
    ? candidate
    : null
}

function candidatesOf(target: ElementTarget): LocatorCandidates {
  if (target.candidates && Object.keys(target.candidates).length > 0) {
    return target.candidates
  }

  return {
    [target.strategy]: { value: target.value },
    css: { value: target.cssSelector },
  }
}

// Candidates are recorded for every strategy, so the preferred one can be
// applied when the script is generated rather than when the page was recorded.
export function resolveStrategy(
  target: ElementTarget,
  preference: SelectorPreference,
): ResolvedLocator {
  const candidates = candidatesOf(target)
  const order = preference === 'auto' ? AUTO_ORDER : [preference, ...AUTO_ORDER]

  for (const strategy of order) {
    const candidate = readCandidate(candidates[strategy])
    if (candidate) {
      return {
        strategy,
        value: candidate.value,
        hasText: candidate.hasText,
        scope: candidate.scope,
        nth: candidate.nth,
      }
    }
  }

  return { strategy: 'css', value: target.cssSelector }
}

function humanizeId(id: string): string {
  const stripped = id.replace(/[-_]?(btn|button|input|field|select|checkbox)$/i, '')
  if (!stripped) return id
  return stripped
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function describeHumanTarget(target: ElementTarget | null): string {
  if (!target) {
    return 'the page'
  }

  const tagName = target.tagName?.toLowerCase() ?? ''
  const role = target.role?.toLowerCase() ?? (target.strategy === 'role' ? target.value.toLowerCase() : '')

  const label = target.candidates?.label?.value || (target.strategy === 'label' ? target.value : undefined)
  const accessibleName =
    target.accessibleName ||
    (target.strategy === 'role' && target.value !== target.accessibleName ? target.accessibleName : undefined)
  const placeholder =
    target.candidates?.placeholder?.value || (target.strategy === 'placeholder' ? target.value : undefined)
  const visibleText =
    target.candidates?.text?.value || target.textSnippet || (target.strategy === 'text' ? target.value : undefined)

  // 1. Buttons
  const isButton = tagName === 'button' || role === 'button' || target.value?.toLowerCase().includes('button')
  if (isButton) {
    const buttonText =
      accessibleName || visibleText || label || (target.strategy === 'testId' ? humanizeId(target.value) : undefined)
    if (buttonText) {
      return `"${buttonText}" button`
    }
    return 'button'
  }

  // 2. Checkboxes
  const isCheckbox =
    role === 'checkbox' ||
    (tagName === 'input' && (target.cssSelector?.includes('checkbox') || target.value?.includes('checkbox')))
  if (isCheckbox) {
    const checkboxName = label || accessibleName || (target.strategy === 'testId' ? humanizeId(target.value) : undefined)
    if (checkboxName) {
      return `"${checkboxName}" checkbox`
    }
    return 'checkbox'
  }

  // 3. Inputs / Textareas / Selects / Form controls
  const isField =
    ['input', 'textarea', 'select'].includes(tagName) ||
    ['textbox', 'combobox', 'searchbox', 'spinbutton'].includes(role)
  if (isField) {
    const fieldName = label || accessibleName || placeholder || (target.strategy === 'testId' ? humanizeId(target.value) : undefined)
    if (fieldName) {
      return `"${fieldName}" field`
    }
  }

  // 4. Other elements with human-readable attributes
  if (label) {
    return `the field labelled "${label}"`
  }
  if (accessibleName) {
    return `"${accessibleName}"`
  }
  if (placeholder) {
    return `the field with placeholder "${placeholder}"`
  }
  if (visibleText && visibleText.trim().length > 0 && visibleText.length < 50) {
    return `"${visibleText.trim()}"`
  }

  // Fallback to standard locator strategy
  switch (target.strategy) {
    case 'testId':
      return `the element with test id "${target.value}"`
    case 'role':
      return target.accessibleName
        ? `the ${target.value} "${target.accessibleName}"`
        : `the ${target.value}`
    case 'label':
      return `the field labelled "${target.value}"`
    case 'placeholder':
      return `the field with placeholder "${target.value}"`
    case 'text':
      return `"${target.value}"`
    case 'css':
      return `\`${target.cssSelector}\``
  }
}

export function describeTarget(target: ElementTarget | null): string {
  return describeHumanTarget(target)
}

export function describeAssertion(step: InteractionEvent): string {
  if (step.customAction) {
    return step.customAction
  }
  const claim = describeClaim(step)
  const reason = step.customExpected || step.assertion?.message

  return reason ? `${claim}, because ${reason}` : claim
}

function describeClaim(step: InteractionEvent): string {
  const detail = step.assertion

  if (!detail) {
    return 'Check the page'
  }

  const subject = describeTarget(step.target)
  const expected = detail.expected ?? ''

  switch (detail.kind) {
    case 'visible':
      return `Check that ${subject} is visible`
    case 'hidden':
      return `Check that ${subject} is not visible`
    case 'text':
      return `Check that ${subject} contains "${expected}"`
    case 'notText':
      return `Check that ${subject} does not contain "${expected}"`
    case 'exactText':
      return `Check that ${subject} reads exactly "${expected}"`
    case 'value':
      return `Check that ${subject} has the value "${expected}"`
    case 'enabled':
      return `Check that ${subject} is enabled`
    case 'disabled':
      return `Check that ${subject} is disabled`
    case 'checked':
      return `Check that ${subject} is checked`
    case 'unchecked':
      return `Check that ${subject} is not checked`
    case 'count':
      return `Check that ${subject} matches ${expected} elements`
    case 'attribute':
      return `Check that ${subject} has ${detail.attribute} set to "${expected}"`
    case 'url':
      return `Check that the page URL is ${expected}`
    case 'title':
      return `Check that the page title is "${expected}"`
    default:
      return `Check ${subject}`
  }
}

export function formatExpectedAssertion(step: InteractionEvent): string {
  if (step.customExpected) {
    return step.customExpected
  }
  const detail = step.assertion
  if (detail?.message) {
    return detail.message
  }
  if (!detail) return describeStep(step)
  const subject = describeTarget(step.target)
  const expected = detail.expected ?? ''

  switch (detail.kind) {
    case 'visible':
      return `${subject} should be visible`
    case 'hidden':
      return `${subject} should be hidden / not exist`
    case 'text':
      return `${subject} should contain "${expected}"`
    case 'notText':
      return `${subject} should not contain "${expected}"`
    case 'exactText':
      return `${subject} should have exact text "${expected}"`
    case 'value':
      return `${subject} should have value "${expected}"`
    case 'enabled':
      return `${subject} should be enabled`
    case 'disabled':
      return `${subject} should be disabled`
    case 'checked':
      return `${subject} should be checked`
    case 'unchecked':
      return `${subject} should be unchecked`
    case 'count':
      return `${subject} should match ${expected} elements`
    case 'attribute':
      return `${subject} should have attribute ${detail.attribute}="${expected}"`
    case 'url':
      return `URL should be "${expected}"`
    case 'title':
      return `Title should be "${expected}"`
    default:
      return describeClaim(step)
  }
}

export function formatActualAssertion(step: InteractionEvent): string {
  const detail = step.assertion
  if (!detail) return 'Unmet condition'
  const subject = describeTarget(step.target)
  const actual = detail.actual

  if (actual !== undefined) {
    switch (detail.kind) {
      case 'visible':
        return `${subject} is ${actual}`
      case 'hidden':
        return `${subject} is ${actual} (it is present in the DOM)`
      case 'text':
        return `${subject} contains "${actual}" instead`
      case 'notText':
        return `${subject} contains "${actual}"`
      case 'exactText':
        return `${subject} has text "${actual}"`
      case 'value':
        return `${subject} has value "${actual}"`
      case 'enabled':
      case 'disabled':
        return `${subject} is currently ${actual}`
      case 'checked':
      case 'unchecked':
        return `${subject} is currently ${actual}`
      default:
        return `${subject} actual state is "${actual}"`
    }
  }

  return `Observed state did not match expected ${detail.kind}`
}

export function isCheckboxOrRadio(target: ElementTarget | null): boolean {
  if (!target) return false
  const role = target.role?.toLowerCase() || target.candidates?.role?.value?.toLowerCase()
  if (role === 'checkbox' || role === 'radio') return true

  const css = (target.cssSelector || '').toLowerCase()
  if (
    css.includes('checkbox') ||
    css.includes('radio') ||
    css.includes('type="checkbox"') ||
    css.includes("type='checkbox'") ||
    css.includes('type="radio"') ||
    css.includes("type='radio'")
  ) {
    return true
  }

  const val = (target.value || '').toLowerCase()
  if (val.includes('checkbox') || val.includes('radio')) return true

  const testId = (target.candidates?.testId?.value || '').toLowerCase()
  if (testId.includes('checkbox') || testId.includes('radio')) return true

  return false
}

export function formatQaseCaseUrl(
  projectCode: string,
  caseId: number | string,
  suiteId?: number | null,
): string {
  const cleanCode = (projectCode || 'SQA').toUpperCase()
  const rawIdStr = String(caseId).trim()
  const numericId = rawIdStr.replace(/^[A-Za-z0-9_-]+-/, '')

  if (suiteId != null) {
    return `https://app.qase.io/project/${cleanCode}?suite=${suiteId}&previewMode=modal&case=${numericId}`
  }
  return `https://app.qase.io/project/${cleanCode}?previewMode=modal&case=${numericId}`
}

export function describeStep(step: InteractionEvent): string {
  if (step.customAction) {
    return step.customAction
  }

  switch (step.type) {
    case 'marker':
      return step.value ?? 'Step'
    case 'assertion':
      return describeAssertion(step)
    case 'navigation':
      return `Navigate to ${step.value ?? 'the page'}`
    case 'click':
    case 'change': {
      const isCheck =
        isCheckboxOrRadio(step.target) ||
        (step.target?.tagName?.toLowerCase() === 'input' && (step.value === 'true' || step.value === 'false'))
      if (isCheck) {
        const label =
          step.target?.candidates?.label?.value ||
          step.target?.accessibleName ||
          step.target?.textSnippet ||
          describeHumanTarget(step.target)
        const isRadio = step.target?.role?.toLowerCase() === 'radio'
        const verb = step.value === 'false' ? 'Uncheck' : 'Check'
        const elementKind = isRadio ? 'radio button' : 'checkbox'
        return `${verb} "${label.replace(/^"|"$/g, '')}" ${elementKind}`
      }
      if (step.type === 'click') {
        return `Click ${describeTarget(step.target)}`
      }
      return `Set ${describeTarget(step.target)} to "${step.value ?? ''}"`
    }
    case 'input':
      return `Enter ${step.masked ? 'the secret value' : `"${step.value ?? ''}"`} into ${describeTarget(step.target)}`
    case 'submit':
      return `Submit ${describeTarget(step.target)}`
    case 'keydown':
      return `Press ${step.key ?? 'a key'} on ${describeTarget(step.target)}`
  }
}

export function parseViewport(viewport: string): { width: number; height: number } | null {
  const match = viewport.match(/^(\d+)x(\d+)$/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

export function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

// Only the recording's own origin becomes relative. A run that crosses into a
// different host keeps that URL absolute, since baseURL cannot cover both.
export function relativizeUrl(url: string, baseOrigin: string | null): string {
  if (!baseOrigin) {
    return url
  }

  try {
    const parsed = new URL(url)

    if (parsed.origin !== baseOrigin) {
      return url
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/'
  } catch {
    return url
  }
}

function isSameTarget(a: ElementTarget | null, b: ElementTarget | null): boolean {
  if (!a || !b) return false
  if (a.cssSelector && b.cssSelector && a.cssSelector === b.cssSelector) return true
  if (
    a.candidates?.testId?.value &&
    b.candidates?.testId?.value &&
    a.candidates.testId.value === b.candidates.testId.value
  ) {
    return true
  }
  if (a.value && b.value && a.value === b.value && a.strategy === b.strategy) return true
  if (a.accessibleName && b.accessibleName && a.accessibleName === b.accessibleName) return true
  return false
}

function isLabelForInput(labelTarget: ElementTarget | null, inputTarget: ElementTarget | null): boolean {
  if (!labelTarget || !inputTarget) return false
  const isLabel = labelTarget.tagName?.toLowerCase() === 'label'
  const isInput = inputTarget.tagName?.toLowerCase() === 'input'
  if (!isLabel && !isInput) return false

  if (labelTarget.accessibleName && inputTarget.accessibleName) {
    if (labelTarget.accessibleName === inputTarget.accessibleName) return true
  }
  const labelText =
    labelTarget.textSnippet || labelTarget.accessibleName || labelTarget.candidates?.text?.value
  const inputLabel = inputTarget.candidates?.label?.value || inputTarget.accessibleName
  if (
    labelText &&
    inputLabel &&
    (labelText === inputLabel || labelText.includes(inputLabel) || inputLabel.includes(labelText))
  ) {
    return true
  }
  return false
}

export function cleanAndDeduplicateInteractions(
  interactions: InteractionEvent[],
): InteractionEvent[] {
  const result: InteractionEvent[] = []

  for (let i = 0; i < interactions.length; i++) {
    const current = interactions[i]
    if (!current) continue

    // 1. Ignore redundant container clicks on <form> elements
    if (
      current.type === 'click' &&
      current.target?.tagName?.toLowerCase() === 'form'
    ) {
      continue
    }

    // 2. Trailing submit event deduplication (e.g. form submit after clicking submit button)
    if (current.type === 'submit') {
      const prev = result[result.length - 1]
      if (prev && (prev.type === 'click' || prev.type === 'keydown')) {
        if (current.customExpected && !prev.customExpected) {
          prev.customExpected = current.customExpected
        }
        if (current.customAction && !prev.customAction) {
          prev.customAction = current.customAction
        }
        if (current.assertion && !prev.assertion) {
          prev.assertion = current.assertion
        }
        continue // Drop redundant submit
      }
    }

    const next = interactions[i + 1]

    if (next) {
      const currentIsCheck = isCheckboxOrRadio(current.target)
      const nextIsCheck = isCheckboxOrRadio(next.target)

      // 3. Checkbox/Radio pair: click followed by change (or label click followed by checkbox change)
      if (
        (currentIsCheck || nextIsCheck) &&
        current.type === 'click' &&
        (next.type === 'change' || next.type === 'click') &&
        (isSameTarget(current.target, next.target) || isLabelForInput(current.target, next.target))
      ) {
        const target = next.target?.tagName?.toLowerCase() === 'input' ? next.target : current.target
        const merged: InteractionEvent = {
          ...current,
          type: 'click',
          target,
          value: next.value ?? current.value ?? 'true',
          customExpected: current.customExpected || next.customExpected,
          customAction: current.customAction || next.customAction,
          assertion: current.assertion || next.assertion,
        }
        result.push(merged)
        i++ // Skip redundant change
        continue
      }

      // 4. Redundant click on input/textarea/select immediately followed by input or change
      const isInputClick =
        current.type === 'click' &&
        Boolean(current.target?.tagName) &&
        ['input', 'textarea', 'select'].includes(current.target?.tagName?.toLowerCase() ?? '') &&
        !currentIsCheck

      if (
        isInputClick &&
        (next.type === 'input' || next.type === 'change') &&
        (isSameTarget(current.target, next.target) ||
          (Boolean(current.target?.accessibleName) &&
            current.target?.accessibleName === next.target?.accessibleName))
      ) {
        if (current.customExpected && !next.customExpected) {
          next.customExpected = current.customExpected
        }
        if (current.customAction && !next.customAction) {
          next.customAction = current.customAction
        }
        if (current.assertion && !next.assertion) {
          next.assertion = current.assertion
        }
        continue // Drop the redundant click, keep the input/change
      }

      // 5. Button click followed immediately by submit event on parent form
      if (current.type === 'click' && next.type === 'submit') {
        const merged: InteractionEvent = {
          ...current,
          customExpected: current.customExpected || next.customExpected,
          customAction: current.customAction || next.customAction,
          assertion: current.assertion || next.assertion,
        }
        result.push(merged)
        i++ // Skip redundant submit event
        continue
      }
    }

    result.push(current)
  }

  return result
}

export function formatSpecFilename(
  sessionTitle: string,
  qaseCaseCode?: string | null,
): string {
  let cleanTitle = sessionTitle.trim()
  let effectiveCode = qaseCaseCode?.trim().toLowerCase() || null

  const bracketMatch = cleanTitle.match(/^\[([A-Za-z0-9_-]+)\]\s*(.*)$/)
  if (bracketMatch) {
    if (!effectiveCode) {
      effectiveCode = bracketMatch[1].toLowerCase()
    }
    cleanTitle = bracketMatch[2].trim()
  }

  cleanTitle = cleanTitle.replace(/[\[\]]/g, ' ')

  let slug = cleanTitle
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) {
    slug = 'recorded-session'
  }

  if (effectiveCode) {
    const codeSlug = effectiveCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    if (!slug.startsWith(codeSlug)) {
      slug = `${codeSlug}-${slug}`
    }
  }

  return `${slug}.spec.ts`
}
