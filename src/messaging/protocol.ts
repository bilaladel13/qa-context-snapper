import type {
  JiraConnection,
  JiraCreatedIssue,
  JiraDraft,
  JiraProject,
  JiraUser,
} from '@/jira/types'
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

export type JiraRequest =
  | { type: 'JIRA_GET_CONNECTION' }
  | { type: 'JIRA_CONNECT'; domain: string; email: string; token: string }
  | { type: 'JIRA_DISCONNECT' }
  | { type: 'JIRA_LIST_PROJECTS' }
  | { type: 'JIRA_LIST_ASSIGNEES'; projectKey: string }
  | { type: 'JIRA_CREATE_ISSUE'; draft: JiraDraft }

export interface JiraResponseMap {
  JIRA_GET_CONNECTION: { connection: JiraConnection | null }
  JIRA_CONNECT: { connection: JiraConnection; projects: JiraProject[] }
  JIRA_DISCONNECT: { disconnected: true }
  JIRA_LIST_PROJECTS: { projects: JiraProject[] }
  JIRA_LIST_ASSIGNEES: { users: JiraUser[] }
  JIRA_CREATE_ISSUE: JiraCreatedIssue
}

const JIRA_REQUEST_TYPES = new Set([
  'JIRA_GET_CONNECTION',
  'JIRA_CONNECT',
  'JIRA_DISCONNECT',
  'JIRA_LIST_PROJECTS',
  'JIRA_LIST_ASSIGNEES',
  'JIRA_CREATE_ISSUE',
])

export type DownloadRequest = {
  type: 'DOWNLOAD_FILE'
  content: string
  filename: string
  mimeType: string
}

export interface DownloadResponseMap {
  DOWNLOAD_FILE: { downloadId: number | null; cancelled: boolean }
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'DOWNLOAD_FILE'
  )
}

export function isJiraRequest(value: unknown): value is JiraRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return typeof type === 'string' && JIRA_REQUEST_TYPES.has(type)
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
