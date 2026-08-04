export interface ClientEnvironment {
  browser: string
  browserVersion: string
  os: string
  screenSize: string
  devicePixelRatio: number
  language: string
  userAgent: string
}

export interface PageInfo {
  pageUrl: string
  pageTitle: string
  viewportSize: string
}

export type EnvironmentSnapshot = ClientEnvironment & PageInfo & { capturedAt: string }

export type ConsoleErrorLevel = 'error' | 'warn' | 'unhandledrejection'

export type ConsoleErrorOrigin = 'console' | 'window'

export interface ConsoleErrorEntry {
  id: string
  level: ConsoleErrorLevel
  origin: ConsoleErrorOrigin
  message: string
  source?: string
  lineNumber?: number
  columnNumber?: number
  stack?: string
  timestamp: number
}

// 'failed' is a response the server sent and the app may have swallowed.
// 'error' is a request that never produced one at all.
export type NetworkOutcome = 'success' | 'failed' | 'error'

export interface NetworkEntry {
  id: string
  method: string
  url: string
  status: number | null
  outcome: NetworkOutcome
  durationMs: number
  timestamp: number
}

export type InteractionType =
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'keydown'
  | 'navigation'
  | 'assertion'
  // A named boundary the tester inserts while recording. Carries no action of
  // its own; it exists to divide the run into phases that can be read later.
  | 'marker'

export type AssertionKind =
  | 'visible'
  | 'hidden'
  | 'text'
  | 'exactText'
  | 'value'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'unchecked'
  | 'count'
  | 'attribute'
  | 'url'
  | 'title'

export interface AssertionDetail {
  kind: AssertionKind
  expected?: string
  attribute?: string
  // Surfaced by Playwright when the assertion fails, where the default message
  // says what broke but not why it mattered.
  message?: string
}

export type LocatorStrategy = 'testId' | 'role' | 'label' | 'placeholder' | 'text' | 'css'

// An identifiable ancestor to chain from, so a element in a list is found by
// which row it belongs to rather than by its position among its peers.
export interface LocatorScope {
  strategy: LocatorStrategy
  value: string
  accessibleName?: string
  hasText?: string
}

export interface LocatorCandidate {
  value: string
  // Ways to single out one element, in descending order of resilience. Only one
  // is ever set, and only after being proven unique against the live DOM.
  hasText?: string
  scope?: LocatorScope
  // Positional, so it survives neither reordering nor an added row. Recorded
  // last, when nothing about the element or its ancestors distinguishes it.
  nth?: number
  total?: number
}

export type LocatorCandidates = Partial<Record<LocatorStrategy, LocatorCandidate>>

export interface ElementTarget {
  strategy: LocatorStrategy
  value: string
  role?: string
  accessibleName?: string
  tagName: string
  cssSelector: string
  textSnippet?: string
  testIdAttribute?: string
  candidates?: LocatorCandidates
}

export interface InteractionEvent {
  id: string
  type: InteractionType
  target: ElementTarget | null
  value?: string
  masked?: boolean
  key?: string
  // Present only when type is 'assertion'. Assertions share the interaction
  // stream so they stay in order with the steps they follow.
  assertion?: AssertionDetail
  url: string
  timestamp: number
}

export interface ContextSnapshot {
  sessionId: string
  environment: EnvironmentSnapshot
  consoleErrors: ConsoleErrorEntry[]
  network: NetworkEntry[]
  interactions: InteractionEvent[]
  startedAt: number
  stoppedAt: number
}

export interface GeneratedReport {
  markdown: string
  playwrightScript: string
}

// Describes the capture without carrying it. The image itself lives under its
// own storage key, because RecorderState is broadcast on every counter tick and
// a few hundred kilobytes of base64 has no business riding along.
export interface ScreenshotMeta {
  width: number
  height: number
  bytes: number
  capturedAt: string
}

export type RecorderStatus = 'idle' | 'recording' | 'result'

export interface RecorderState {
  status: RecorderStatus
  sessionId: string | null
  tabId: number | null
  tabUrl: string | null
  tabTitle: string | null
  startedAt: number | null
  stoppedAt: number | null
  interactionCount: number
  consoleErrorCount: number
  networkFailureCount: number
  snapshot: ContextSnapshot | null
  screenshot: ScreenshotMeta | null
  screenshotError: string | null
  report: GeneratedReport | null
}
