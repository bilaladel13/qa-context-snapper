import { describeStep } from '@/generator/shared'
import type { ConsoleErrorEntry, ContextSnapshot } from '@/types'

// Atlassian Document Format. Built straight from the snapshot rather than by
// parsing the Markdown report, so there is no converter to drift out of sync.
interface AdfNode {
  type: string
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  text?: string
  marks?: { type: string }[]
}

export interface AdfDocument {
  type: 'doc'
  version: 1
  content: AdfNode[]
}

// Jira rejects a text node with an empty string, and descriptions have a size
// ceiling that a long recording can reach.
const MAX_CODE_LENGTH = 30_000
const SUMMARY_LIMIT = 255

function text(value: string): AdfNode {
  return { type: 'text', text: value }
}

function paragraph(value: string): AdfNode {
  return value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' }
}

function heading(level: number, value: string): AdfNode {
  return { type: 'heading', attrs: { level }, content: [text(value)] }
}

function codeBlock(language: string, value: string): AdfNode {
  const trimmed =
    value.length > MAX_CODE_LENGTH
      ? `${value.slice(0, MAX_CODE_LENGTH)}\n... truncated`
      : value

  return {
    type: 'codeBlock',
    attrs: { language },
    content: trimmed ? [text(trimmed)] : [],
  }
}

function cell(type: 'tableHeader' | 'tableCell', value: string): AdfNode {
  return { type, attrs: {}, content: [paragraph(value)] }
}

function table(rows: [string, string][]): AdfNode {
  return {
    type: 'table',
    attrs: { isNumberColumnEnabled: false, layout: 'default' },
    content: [
      { type: 'tableRow', content: [cell('tableHeader', 'Field'), cell('tableHeader', 'Value')] },
      ...rows.map((row) => ({
        type: 'tableRow',
        content: [cell('tableCell', row[0]), cell('tableCell', row[1])],
      })),
    ],
  }
}

function orderedList(items: string[]): AdfNode {
  return {
    type: 'orderedList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  }
}

// ADF has no concept of a newline inside a paragraph, so typed line breaks
// become separate paragraphs rather than being flattened into one run-on block.
function richText(value: string, placeholder: string): AdfNode[] {
  const blocks = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return blocks.length > 0 ? blocks.map(paragraph) : [paragraph(placeholder)]
}

function formatConsoleError(entry: ConsoleErrorEntry): string {
  const location = entry.source
    ? ` (${entry.source}${entry.lineNumber ? `:${entry.lineNumber}` : ''})`
    : ''

  return `[${entry.level}]${location} ${entry.message}`
}

function formatDuration(startedAt: number, stoppedAt: number): string {
  const seconds = Math.max(0, Math.round((stoppedAt - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

export function suggestSummary(snapshot: ContextSnapshot): string {
  const page = snapshot.environment.pageTitle || snapshot.environment.pageUrl || 'Recorded session'
  const firstError = snapshot.consoleErrors[0]

  const summary = firstError ? `${page}: ${firstError.message}` : page

  return summary.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_LIMIT)
}

interface DescriptionOptions {
  playwrightScript: string | null
  includeConsoleErrors?: boolean
  actual?: string
  expected?: string
}

export function buildDescription(
  snapshot: ContextSnapshot,
  options: DescriptionOptions,
): AdfDocument {
  const { environment, interactions, consoleErrors } = snapshot
  const finalUrl = interactions[interactions.length - 1]?.url ?? environment.pageUrl

  const content: AdfNode[] = [
    {
      type: 'panel',
      attrs: { panelType: 'info' },
      content: [
        paragraph(
          `Captured with QA Context Snapper on ${new Date(snapshot.stoppedAt).toISOString()}.`,
        ),
      ],
    },
    // The reporter's own words come first. Everything below is machine captured
    // detail that supports them.
    heading(2, 'Actual behaviour'),
    ...richText(options.actual ?? '', 'Describe what went wrong.'),
    heading(2, 'Expected result'),
    ...richText(options.expected ?? '', 'Describe what should have happened.'),
    heading(2, 'Environment'),
    table([
      ['Browser', `${environment.browser} ${environment.browserVersion}`],
      ['Operating system', environment.os],
      ['Screen', `${environment.screenSize} at ${environment.devicePixelRatio}x`],
      ['Viewport', environment.viewportSize],
      ['Language', environment.language],
      ['Page URL', environment.pageUrl],
      ['Final URL', finalUrl],
      ['Recording length', formatDuration(snapshot.startedAt, snapshot.stoppedAt)],
    ]),
    heading(2, 'Steps to reproduce'),
    interactions.length > 0
      ? orderedList(interactions.map(describeStep))
      : paragraph('No interactions were captured.'),
  ]

  if (options.includeConsoleErrors !== false) {
    content.push(heading(2, 'Console output'))
    content.push(
      consoleErrors.length > 0
        ? codeBlock('text', consoleErrors.map(formatConsoleError).join('\n\n'))
        : paragraph('No console errors were captured during the recording.'),
    )
  }

  if (options.playwrightScript) {
    content.push(heading(2, 'Playwright reproduction'))
    content.push(codeBlock('typescript', options.playwrightScript))
  }

  return { type: 'doc', version: 1, content }
}
