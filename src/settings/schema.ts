export type ThemePreference = 'system' | 'light' | 'dark'
export type TestStructure = 'flat' | 'steps'
export type SelectorPreference = 'auto' | 'testId' | 'role' | 'css'
export type QuoteStyle = 'single' | 'double'

export interface PlaywrightSettings {
  testTitle: string
  structure: TestStructure
  selectorPreference: SelectorPreference
  quoteStyle: QuoteStyle
  includeComments: boolean
  includeHeader: boolean
  setViewport: boolean
  includeConsoleAssertion: boolean
  useRelativeUrls: boolean
  secretEnvVar: string
}

export interface CaptureSettings {
  maskSensitive: boolean
  trackKeyboard: boolean
  testIdAttributes: string
}

// The Jira credentials live in their own storage key. Only the non secret
// selection is a preference.
export interface JiraSettings {
  projectKey: string
  projectName: string
  issueTypeId: string
  issueTypeName: string
  includePlaywrightScript: boolean
  includeConsoleErrors: boolean
}

export interface Settings {
  theme: ThemePreference
  playwright: PlaywrightSettings
  capture: CaptureSettings
  jira: JiraSettings
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  playwright: {
    testTitle: 'Bug Reproduction',
    structure: 'flat',
    selectorPreference: 'auto',
    quoteStyle: 'single',
    includeComments: true,
    includeHeader: true,
    setViewport: true,
    includeConsoleAssertion: true,
    useRelativeUrls: true,
    secretEnvVar: 'QA_SNAPPER_SECRET',
  },
  capture: {
    maskSensitive: true,
    trackKeyboard: true,
    testIdAttributes: 'data-testid, data-test-id, data-test, data-qa, data-cy',
  },
  jira: {
    projectKey: '',
    projectName: '',
    issueTypeId: '',
    issueTypeName: '',
    includePlaywrightScript: true,
    includeConsoleErrors: true,
  },
}

export const ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/

// Shape and enum safety only. Free text is stored exactly as typed, otherwise a
// half-finished value would be rewritten under the user mid-keystroke; the
// generator substitutes defaults for anything still invalid at output time.
export function normalizeSettings(value: unknown): Settings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Settings>

  const playwright = { ...DEFAULT_SETTINGS.playwright, ...(raw.playwright ?? {}) }
  const capture = { ...DEFAULT_SETTINGS.capture, ...(raw.capture ?? {}) }
  const jira = { ...DEFAULT_SETTINGS.jira, ...(raw.jira ?? {}) }

  return {
    theme: oneOf(raw.theme, ['system', 'light', 'dark'], DEFAULT_SETTINGS.theme),
    playwright: {
      ...playwright,
      structure: oneOf(playwright.structure, ['flat', 'steps'], DEFAULT_SETTINGS.playwright.structure),
      selectorPreference: oneOf(
        playwright.selectorPreference,
        ['auto', 'testId', 'role', 'css'],
        DEFAULT_SETTINGS.playwright.selectorPreference,
      ),
      quoteStyle: oneOf(playwright.quoteStyle, ['single', 'double'], DEFAULT_SETTINGS.playwright.quoteStyle),
    },
    capture,
    jira,
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function resolvePlaywrightSettings(options: PlaywrightSettings): PlaywrightSettings {
  return {
    ...options,
    secretEnvVar: ENV_VAR_PATTERN.test(options.secretEnvVar)
      ? options.secretEnvVar
      : DEFAULT_SETTINGS.playwright.secretEnvVar,
    testTitle:
      options.testTitle.trim().length > 0
        ? options.testTitle.trim()
        : DEFAULT_SETTINGS.playwright.testTitle,
  }
}

const TEST_ID_PATTERN = /^[a-zA-Z][\w-]*$/

export function parseTestIdAttributes(value: string): string[] {
  const parsed = value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => TEST_ID_PATTERN.test(entry))

  return parsed.length > 0
    ? parsed
    : DEFAULT_SETTINGS.capture.testIdAttributes.split(/[,\s]+/).filter(Boolean)
}
