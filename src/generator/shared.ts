import { MAX_TEXT_LENGTH } from '@/shared/constants'
import type { QuoteStyle, SelectorPreference } from '@/settings/schema'
import type { ElementTarget, InteractionEvent, LocatorStrategy } from '@/types'

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

// Captures longer than the limit are stored with a trailing ellipsis that would
// never match the real text. A shorter value ending in "..." is genuine content.
export function trimEllipsis(value: string): string {
  const wasTruncated = value.length >= MAX_TEXT_LENGTH && value.endsWith('...')
  return wasTruncated ? value.slice(0, -3).trimEnd() : value
}

export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

export interface ResolvedLocator {
  strategy: LocatorStrategy
  value: string
}

// Candidates are recorded for every strategy, so the preferred one can be
// applied when the script is generated rather than when the page was recorded.
export function resolveStrategy(
  target: ElementTarget,
  preference: SelectorPreference,
): ResolvedLocator {
  const candidates = target.candidates ?? { [target.strategy]: target.value, css: target.cssSelector }
  const order = preference === 'auto' ? AUTO_ORDER : [preference, ...AUTO_ORDER]

  for (const strategy of order) {
    const value = candidates[strategy]
    if (value !== undefined && value !== '') {
      return { strategy, value }
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

export function describeStep(step: InteractionEvent): string {
  switch (step.type) {
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
