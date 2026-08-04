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

export function describeTarget(target: ElementTarget | null): string {
  if (!target) {
    return 'the page'
  }

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

export function describeAssertion(step: InteractionEvent): string {
  const claim = describeClaim(step)
  const reason = step.assertion?.message

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

export function describeStep(step: InteractionEvent): string {
  switch (step.type) {
    case 'marker':
      return step.value ?? 'Step'
    case 'assertion':
      return describeAssertion(step)
    case 'navigation':
      return `Navigate to ${step.value ?? 'the page'}`
    case 'click':
      return `Click ${describeTarget(step.target)}`
    case 'input':
      return `Type ${step.masked ? 'the secret value' : `"${step.value ?? ''}"`} into ${describeTarget(step.target)}`
    case 'change':
      return `Set ${describeTarget(step.target)} to "${step.value ?? ''}"`
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
