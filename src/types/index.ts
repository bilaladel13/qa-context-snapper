export interface EnvironmentSnapshot {
  browser: string
  browserVersion: string
  os: string
  screenSize: string
  viewportSize: string
  devicePixelRatio: number
  language: string
  userAgent: string
  pageUrl: string
  pageTitle: string
  capturedAt: string
}

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

export interface ElementTarget {
  strategy: LocatorStrategy
  value: string
  role?: string
  accessibleName?: string
  tagName: string
  cssSelector: string
  textSnippet?: string
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
