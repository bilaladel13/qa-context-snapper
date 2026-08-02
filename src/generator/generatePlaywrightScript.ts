import { DEFAULT_SETTINGS, resolvePlaywrightSettings } from '@/settings/schema'
import type { PlaywrightSettings } from '@/settings/schema'
import type {
  ContextSnapshot,
  ElementTarget,
  InteractionEvent,
  LocatorScope,
  LocatorStrategy,
} from '@/types'
import { originOf, parseViewport, quote, relativizeUrl, resolveStrategy, trimEllipsis } from './shared'

function leafExpression(
  strategy: LocatorStrategy,
  value: string,
  accessibleName: string | undefined,
  q: (input: string) => string,
): string {
  switch (strategy) {
    case 'testId':
      return `getByTestId(${q(value)})`
    case 'role': {
      const name = accessibleName ? trimEllipsis(accessibleName) : ''
      return name ? `getByRole(${q(value)}, { name: ${q(name)} })` : `getByRole(${q(value)})`
    }
    case 'label':
      return `getByLabel(${q(trimEllipsis(value))})`
    case 'placeholder':
      return `getByPlaceholder(${q(trimEllipsis(value))})`
    case 'text':
      return `getByText(${q(trimEllipsis(value))})`
    case 'css':
      return `locator(${q(value)})`
  }
}

function scopeExpression(scope: LocatorScope, q: (input: string) => string): string {
  const base = leafExpression(scope.strategy, scope.value, scope.accessibleName, q)
  const filtered = scope.hasText ? `${base}.filter({ hasText: ${q(scope.hasText)} })` : base

  return `page.${filtered}`
}

function locator(
  target: ElementTarget,
  options: PlaywrightSettings,
  { indexed = true }: { indexed?: boolean } = {},
): string {
  const { strategy, value, hasText, scope, nth } = resolveStrategy(
    target,
    options.selectorPreference,
  )
  const q = (input: string) => quote(input, options.quoteStyle)

  const root = scope ? scopeExpression(scope, q) : 'page'
  const base = `${root}.${leafExpression(strategy, value, target.accessibleName, q)}`

  // Identity first: filtering by the element's own text, or chaining from the
  // row that owns it, both survive a list being reordered or added to.
  if (hasText) {
    return `${base}.filter({ hasText: ${q(hasText)} })`
  }

  if (scope) {
    return base
  }

  // Positional, and only reached when nothing else singled the element out. A
  // count assertion is about the whole set, so it is never indexed.
  return nth === undefined || !indexed ? base : `${base}.nth(${nth})`
}

function assertion(
  step: InteractionEvent,
  options: PlaywrightSettings,
  toUrl: (url: string) => string,
): string[] {
  const detail = step.assertion

  if (!detail) {
    return []
  }

  const q = (input: string) => quote(input, options.quoteStyle)
  const expected = detail.expected ?? ''

  // Playwright resolves toHaveURL against baseURL exactly as goto does, so the
  // two have to agree or a relative run asserts against an absolute address.
  if (detail.kind === 'url') {
    return [`await expect(page).toHaveURL(${q(toUrl(expected))});`]
  }

  if (detail.kind === 'title') {
    return [`await expect(page).toHaveTitle(${q(expected)});`]
  }

  if (!step.target) {
    return []
  }

  const subject = `expect(${locator(step.target, options, { indexed: detail.kind !== 'count' })})`

  switch (detail.kind) {
    case 'visible':
      return [`await ${subject}.toBeVisible();`]
    case 'hidden':
      return [`await ${subject}.toBeHidden();`]
    case 'text':
      return [`await ${subject}.toContainText(${q(trimEllipsis(expected))});`]
    case 'exactText':
      return [`await ${subject}.toHaveText(${q(trimEllipsis(expected))});`]
    case 'value':
      return [`await ${subject}.toHaveValue(${q(expected)});`]
    case 'enabled':
      return [`await ${subject}.toBeEnabled();`]
    case 'disabled':
      return [`await ${subject}.toBeDisabled();`]
    case 'checked':
      return [`await ${subject}.toBeChecked();`]
    case 'unchecked':
      return [`await ${subject}.not.toBeChecked();`]
    case 'count':
      return [`await ${subject}.toHaveCount(${Number(expected) || 0});`]
    case 'attribute':
      return [
        `await ${subject}.toHaveAttribute(${q(detail.attribute ?? '')}, ${q(expected)});`,
      ]
    default:
      return []
  }
}

function statement(
  step: InteractionEvent,
  options: PlaywrightSettings,
  toUrl: (url: string) => string,
): string[] {
  const q = (input: string) => quote(input, options.quoteStyle)

  if (step.type === 'assertion') {
    return assertion(step, options, toUrl)
  }

  if (step.type === 'navigation') {
    return [`await page.goto(${q(toUrl(step.value ?? ''))});`]
  }

  if (!step.target) {
    return step.type === 'keydown' && step.key
      ? [`await page.keyboard.press(${q(step.key)});`]
      : []
  }

  const base = locator(step.target, options)
  const fillValue = step.masked ? `process.env.${options.secretEnvVar} ?? ''` : q(step.value ?? '')

  switch (step.type) {
    case 'click':
      return [`await ${base}.click();`]
    case 'input': {
      const lines = step.masked && options.includeComments ? ['// Value was redacted during capture.'] : []
      lines.push(`await ${base}.fill(${fillValue});`)
      return lines
    }
    case 'change': {
      if (step.target.tagName === 'select') {
        return [`await ${base}.selectOption({ label: ${q(step.value ?? '')} });`]
      }
      if (step.target.tagName === 'input' && (step.value === 'true' || step.value === 'false')) {
        return [`await ${base}.${step.value === 'true' ? 'check' : 'uncheck'}();`]
      }
      return [`await ${base}.fill(${fillValue});`]
    }
    case 'submit':
      return options.includeComments ? [`// Form submitted: ${step.target.cssSelector}`] : []
    case 'keydown':
      return [`await ${base}.press(${q(step.key ?? 'Enter')});`]
    default:
      return []
  }
}

function dedupeNavigation(steps: InteractionEvent[]): InteractionEvent[] {
  let lastUrl: string | null = null

  return steps.filter((step) => {
    if (step.type !== 'navigation') {
      return true
    }

    const isRepeat = step.value === lastUrl
    lastUrl = step.value ?? null
    return !isRepeat
  })
}

// A step boundary is any navigation, so test.step groups map onto the pages the
// tester actually moved through.
function groupIntoSteps(steps: InteractionEvent[]): { title: string; steps: InteractionEvent[] }[] {
  const groups: { title: string; steps: InteractionEvent[] }[] = []

  for (const step of steps) {
    if (step.type === 'navigation' || groups.length === 0) {
      const title = step.type === 'navigation' ? `Go to ${shortUrl(step.value ?? '')}` : 'Initial page'
      groups.push({ title, steps: [] })
    }

    groups[groups.length - 1]?.steps.push(step)
  }

  return groups.filter((group) => group.steps.length > 0)
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || parsed.hostname
  } catch {
    return url
  }
}

export function generatePlaywrightScript(
  snapshot: ContextSnapshot,
  requested: PlaywrightSettings = DEFAULT_SETTINGS.playwright,
): string {
  const options = resolvePlaywrightSettings(requested)
  const { environment, interactions, consoleErrors } = snapshot
  const steps = dedupeNavigation(interactions)
  const startUrl = steps.find((step) => step.type === 'navigation')?.value ?? environment.pageUrl
  const q = (input: string) => quote(input, options.quoteStyle)

  const baseOrigin = options.useRelativeUrls ? originOf(startUrl) : null
  const toUrl = (url: string) => relativizeUrl(url, baseOrigin)

  const lines: string[] = []

  if (options.includeHeader) {
    lines.push(
      `// Generated by QA Context Snapper on ${new Date(snapshot.stoppedAt).toISOString()}`,
      `// ${environment.browser} ${environment.browserVersion} on ${environment.os}`,
    )

    if (baseOrigin) {
      lines.push(`// Navigation is relative. Set baseURL to '${baseOrigin}' in playwright.config.ts.`)
    }

    if (interactions.some((step) => step.masked)) {
      lines.push(`// Set ${options.secretEnvVar} in the environment before running this test.`)
    }
  }

  lines.push(`import { test, expect } from ${q('@playwright/test')};`, '')
  lines.push(`test(${q(options.testTitle)}, async ({ page }) => {`)

  if (options.includeConsoleAssertion) {
    lines.push(
      `  const consoleErrors: string[] = [];`,
      '',
      `  page.on(${q('console')}, (message) => {`,
      `    if (message.type() === ${q('error')}) consoleErrors.push(message.text());`,
      `  });`,
      `  page.on(${q('pageerror')}, (error) => consoleErrors.push(error.message));`,
      '',
    )
  }

  const viewport = options.setViewport ? parseViewport(environment.viewportSize) : null
  if (viewport) {
    lines.push(`  await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });`)
  }

  lines.push(`  await page.goto(${q(toUrl(startUrl))});`, '')

  const body = steps.filter(
    (step, index) => !(index === 0 && step.type === 'navigation' && step.value === startUrl),
  )

  if (options.structure === 'steps') {
    for (const group of groupIntoSteps(body)) {
      const inner = group.steps.flatMap((step) => statement(step, options, toUrl))
      if (inner.length === 0) continue

      lines.push(`  await test.step(${q(group.title)}, async () => {`)
      for (const line of inner) {
        lines.push(`    ${line}`)
      }
      lines.push('  });', '')
    }
  } else {
    for (const step of body) {
      for (const line of statement(step, options, toUrl)) {
        lines.push(`  ${line}`)
      }
    }
  }

  if (options.includeConsoleAssertion && consoleErrors.length > 0) {
    if (options.includeComments) {
      lines.push(
        '',
        `  // The recording captured ${consoleErrors.length} console error(s).`,
        `  // This assertion fails while the bug is present and passes once it is fixed.`,
      )
    }
    lines.push(`  expect(consoleErrors, ${q('the page should log no console errors')}).toEqual([]);`)
  }

  while (lines[lines.length - 1] === '') {
    lines.pop()
  }

  lines.push('});', '')

  return lines.join('\n')
}
