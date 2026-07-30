import type {
  ConsoleErrorEntry,
  EnvironmentSnapshot,
  InteractionEvent,
  PageInfo,
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

export interface ActiveTabInfo extends PageInfo {
  tabId: number
  recordable: boolean
  blockedReason: string | null
}

export type PopupQuery = { type: 'GET_ACTIVE_TAB' } | { type: 'FOCUS_RECORDED_TAB' }

export interface PopupQueryResponseMap {
  GET_ACTIVE_TAB: ActiveTabInfo
  FOCUS_RECORDED_TAB: { focused: boolean }
}

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

const POPUP_REQUEST_TYPES = new Set([
  'GET_STATE',
  'START_RECORDING',
  'STOP_RECORDING',
  'RESET_RECORDING',
])

const POPUP_QUERY_TYPES = new Set(['GET_ACTIVE_TAB', 'FOCUS_RECORDED_TAB'])

export function isPopupRequest(value: unknown): value is PopupRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return typeof type === 'string' && POPUP_REQUEST_TYPES.has(type)
}

export function isPopupQuery(value: unknown): value is PopupQuery {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return typeof type === 'string' && POPUP_QUERY_TYPES.has(type)
}

export function isBackgroundBroadcast(value: unknown): value is BackgroundBroadcast {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'STATE_CHANGED'
  )
}
