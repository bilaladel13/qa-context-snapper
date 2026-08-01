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

export type InteractionType = 'click' | 'input' | 'change' | 'submit' | 'keydown' | 'navigation'

export type LocatorStrategy = 'testId' | 'role' | 'label' | 'placeholder' | 'text' | 'css'

export interface LocatorCandidate {
  value: string
  // Set only when this locator resolves to more than one element, which would
  // otherwise be a Playwright strict mode violation. Zero based.
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
  url: string
  timestamp: number
}

export interface ContextSnapshot {
  sessionId: string
  environment: EnvironmentSnapshot
  consoleErrors: ConsoleErrorEntry[]
  interactions: InteractionEvent[]
  startedAt: number
  stoppedAt: number
}

export interface GeneratedReport {
  markdown: string
  playwrightScript: string
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
  snapshot: ContextSnapshot | null
  report: GeneratedReport | null
}
