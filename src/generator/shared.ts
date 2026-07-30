import { MAX_TEXT_LENGTH } from '@/content/locator'
import type { ElementTarget, InteractionEvent } from '@/types'

export const SECRET_ENV_VAR = 'QA_SNAPPER_SECRET'

export function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')

  return `'${escaped}'`
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

  if (!match) {
    return null
  }

  return { width: Number(match[1]), height: Number(match[2]) }
}
