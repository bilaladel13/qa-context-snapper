import type {
  ConsoleErrorEntry,
  EnvironmentSnapshot,
  InteractionEvent,
  RecorderState,
} from '@/types'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail<T = never>(error: string): Result<T> {
  return { ok: false, error }
}

export type PopupRequest =
  | { type: 'GET_STATE' }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'RESET_RECORDING' }

export type PopupResponse = Result<RecorderState>

export type ContentRequest =
  | { type: 'CONTENT_PING' }
  | { type: 'CONTENT_START_RECORDING'; sessionId: string }
  | { type: 'CONTENT_STOP_RECORDING'; sessionId: string }

export interface ContentResponseMap {
  CONTENT_PING: { acknowledged: true }
  CONTENT_START_RECORDING: { acknowledged: true }
  CONTENT_STOP_RECORDING: { acknowledged: true }
}

export type ContentResponse = Result<ContentResponseMap[ContentRequest['type']]>

export type ContentToBackground =
  | { type: 'CONTENT_HELLO' }
  | { type: 'RECORD_INTERACTION'; sessionId: string; interaction: InteractionEvent }
  | { type: 'RECORD_CONSOLE_ERROR'; sessionId: string; error: ConsoleErrorEntry }
  | { type: 'RECORD_ENVIRONMENT'; sessionId: string; environment: EnvironmentSnapshot }

export interface ContentToBackgroundResponseMap {
  CONTENT_HELLO: { sessionId: string | null }
  RECORD_INTERACTION: { received: true }
  RECORD_CONSOLE_ERROR: { received: true }
  RECORD_ENVIRONMENT: { received: true }
}

export type BackgroundBroadcast = { type: 'STATE_CHANGED'; state: RecorderState }

const CONTENT_TO_BACKGROUND_TYPES = new Set([
  'CONTENT_HELLO',
  'RECORD_INTERACTION',
  'RECORD_CONSOLE_ERROR',
  'RECORD_ENVIRONMENT',
])

export function isContentToBackground(value: unknown): value is ContentToBackground {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return typeof type === 'string' && CONTENT_TO_BACKGROUND_TYPES.has(type)
}

export function isPopupRequest(value: unknown): value is PopupRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return (
    type === 'GET_STATE' ||
    type === 'START_RECORDING' ||
    type === 'STOP_RECORDING' ||
    type === 'RESET_RECORDING'
  )
}

export function isBackgroundBroadcast(value: unknown): value is BackgroundBroadcast {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'STATE_CHANGED'
  )
}
