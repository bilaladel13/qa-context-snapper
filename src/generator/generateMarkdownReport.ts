import type { ConsoleErrorEntry, ContextSnapshot } from '@/types'
import { describeStep, escapeTableCell } from './shared'

const LEVEL_LABELS: Record<ConsoleErrorEntry['level'], string> = {
  error: 'Error',
  warn: 'Warning',
  unhandledrejection: 'Unhandled rejection',
}

function formatDuration(startedAt: number, stoppedAt: number): string {
  const seconds = Math.max(0, Math.round((stoppedAt - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function environmentTable(snapshot: ContextSnapshot): string[] {
  const { environment } = snapshot

  const rows: [string, string][] = [
    ['Browser', `${environment.browser} ${environment.browserVersion}`],
    ['Operating system', environment.os],
    ['Screen size', environment.screenSize],
    ['Viewport', environment.viewportSize],
    ['Device pixel ratio', String(environment.devicePixelRatio)],
    ['Language', environment.language],
    ['Page URL', environment.pageUrl],
    ['Page title', environment.pageTitle],
    ['Captured at', environment.capturedAt],
    ['Recording length', formatDuration(snapshot.startedAt, snapshot.stoppedAt)],
  ]

  return [
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([field, value]) => `| ${field} | ${escapeTableCell(value)} |`),
  ]
}

function consoleSection(errors: ConsoleErrorEntry[]): string[] {
  if (errors.length === 0) {
    return ['No console errors were captured during the recording.']
  }

  const lines: string[] = []

  for (const entry of errors) {
    const location = entry.source
      ? ` (${entry.source}${entry.lineNumber ? `:${entry.lineNumber}` : ''})`
      : ''

    lines.push(`- **${LEVEL_LABELS[entry.level]}**${location}`)
    lines.push('')
    lines.push('  ```')
    for (const line of entry.message.split('\n')) {
      lines.push(`  ${line}`)
    }
    lines.push('  ```')
    lines.push('')
  }

  return lines
}

// Numbering runs unbroken across named phases, so a comment can still refer to
// "step 7" while the reader sees which phase it belongs to.
function numberedSteps(interactions: ContextSnapshot['interactions']): string[] {
  const lines: string[] = []
  let number = 0

  for (const step of interactions) {
    if (step.type === 'marker') {
      if (lines.length > 0) {
        lines.push('')
      }

      lines.push(`**${describeStep(step)}**`, '')
      continue
    }

    number += 1
    lines.push(`${number}. ${describeStep(step)}`)
  }

  return lines
}

export function generateMarkdownReport(snapshot: ContextSnapshot): string {
  const { environment, interactions, consoleErrors } = snapshot
  const finalUrl = interactions[interactions.length - 1]?.url ?? environment.pageUrl

  const steps = interactions.length > 0 ? numberedSteps(interactions) : ['No interactions were captured.']

  const lines = [
    `# Bug report: ${environment.pageTitle || environment.pageUrl}`,
    '',
    '## Summary',
    '',
    '_Describe the problem in one or two sentences._',
    '',
    '## Environment',
    '',
    ...environmentTable(snapshot),
    '',
    '## Steps to reproduce',
    '',
    ...steps,
    '',
    '## Expected result',
    '',
    '_What should have happened._',
    '',
    '## Actual result',
    '',
    consoleErrors.length > 0
      ? `The page logged ${consoleErrors.length} console error(s). See below.`
      : '_What happened instead._',
    '',
    '## Console output',
    '',
    ...consoleSection(consoleErrors),
    '## Additional context',
    '',
    `- Final URL: ${finalUrl}`,
    `- Interactions captured: ${interactions.length}`,
    `- User agent: \`${environment.userAgent}\``,
    '',
    '---',
    '',
    '_Captured with QA Context Snapper._',
    '',
  ]

  return lines.join('\n')
}
