import type { ConsoleErrorLevel, ConsoleErrorOrigin } from '@/types'

export const CONSOLE_CHANNEL = 'qa-context-snapper/console'

export interface BridgePayload {
  level: ConsoleErrorLevel
  origin: ConsoleErrorOrigin
  message: string
  stack?: string
  source?: string
  lineNumber?: number
  columnNumber?: number
  timestamp: number
}

export interface BridgeMessage {
  channel: string
  sessionId: string
  payload: BridgePayload
}

export interface BridgeControl {
  channel: string
  control: 'set-session'
  sessionId: string | null
}
