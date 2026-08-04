import type { ConsoleErrorLevel, ConsoleErrorOrigin, NetworkOutcome } from '@/types'

export const CONSOLE_CHANNEL = 'qa-context-snapper/console'

export interface BridgeConsolePayload {
  kind: 'console'
  level: ConsoleErrorLevel
  origin: ConsoleErrorOrigin
  message: string
  stack?: string
  source?: string
  lineNumber?: number
  columnNumber?: number
  timestamp: number
}

export interface BridgeNetworkPayload {
  kind: 'network'
  method: string
  url: string
  status: number | null
  outcome: NetworkOutcome
  durationMs: number
  timestamp: number
}

export type BridgePayload = BridgeConsolePayload | BridgeNetworkPayload

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
