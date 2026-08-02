import { sendToTab } from '@/messaging/client'
import {
  fail,
  isContentToBackground,
  isJiraRequest,
  isPopupQuery,
  isPopupRequest,
  ok,
} from '@/messaging/protocol'
import { handleJiraRequest } from './jira'
import type {
  ActiveTabInfo,
  ContentToBackground,
  PopupQuery,
  PopupRequest,
  PopupResponse,
  Result,
} from '@/messaging/protocol'
import { generateReport } from '@/generator'
import { loadSettings, onSettingsChanged } from '@/settings/store'
import type { ContextSnapshot, EnvironmentSnapshot } from '@/types'
import {
  appendConsoleError,
  appendInteraction,
  beginSession,
  clearAll,
  getBuffer,
  getState,
  setEnvironment,
  updateState,
} from './store'
import {
  blockedReason,
  ensureContentScript,
  getActiveTab,
  installConsoleCapture,
  queryActiveTab,
  readViewport,
} from './tabs'

const FALLBACK_ENVIRONMENT: EnvironmentSnapshot = {
  browser: 'Unknown',
  browserVersion: 'unknown',
  os: 'Unknown',
  screenSize: 'unknown',
  viewportSize: 'unknown',
  devicePixelRatio: 1,
  language: 'unknown',
  userAgent: 'unknown',
  pageUrl: '',
  pageTitle: '',
  capturedAt: new Date(0).toISOString(),
}

async function setBadge(recording: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: recording ? 'REC' : '' })

    if (recording) {
      await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
      await chrome.action.setTitle({ title: 'QA Context Snapper: recording in progress' })
    } else {
      await chrome.action.setTitle({ title: 'QA Context Snapper' })
    }
  } catch {
    // The action API is unavailable while the worker is shutting down.
  }
}

async function startRecording(): Promise<PopupResponse> {
  const tab = await getActiveTab()

  if (!tab.ok) {
    return tab
  }

  const tabId = tab.data.id as number
  const ready = await ensureContentScript(tabId)

  if (!ready.ok) {
    return ready
  }

  const sessionId = crypto.randomUUID()

  await installConsoleCapture(tabId, sessionId)

  const state = await beginSession(sessionId, {
    status: 'recording',
    tabId,
    tabUrl: tab.data.url ?? null,
    tabTitle: tab.data.title ?? null,
    startedAt: Date.now(),
  })

  const started = await sendToTab(tabId, { type: 'CONTENT_START_RECORDING', sessionId })

  if (!started.ok) {
    await clearAll()
    await setBadge(false)
    return started
  }

  await setBadge(true)

  return ok(state)
}

async function stopRecording(): Promise<PopupResponse> {
  const state = await getState()

  if (state.status !== 'recording' || state.sessionId === null) {
    return fail('There is no recording in progress.')
  }

  if (state.tabId !== null) {
    await sendToTab(state.tabId, { type: 'CONTENT_STOP_RECORDING', sessionId: state.sessionId })
  }

  const buffer = await getBuffer()
  const stoppedAt = Date.now()

  const snapshot: ContextSnapshot = {
    sessionId: state.sessionId,
    environment: buffer?.environment ?? {
      ...FALLBACK_ENVIRONMENT,
      pageUrl: state.tabUrl ?? '',
      pageTitle: state.tabTitle ?? '',
    },
    interactions: buffer?.interactions ?? [],
    consoleErrors: buffer?.consoleErrors ?? [],
    startedAt: state.startedAt ?? stoppedAt,
    stoppedAt,
  }

  await setBadge(false)

  return ok(
    await updateState({
      status: 'result',
      stoppedAt,
      snapshot,
      report: generateReport(snapshot, await loadSettings()),
      interactionCount: snapshot.interactions.length,
      consoleErrorCount: snapshot.consoleErrors.length,
    }),
  )
}

async function resetRecording(): Promise<PopupResponse> {
  const state = await getState()

  if (state.status === 'recording' && state.tabId !== null && state.sessionId !== null) {
    await sendToTab(state.tabId, { type: 'CONTENT_STOP_RECORDING', sessionId: state.sessionId })
  }

  await setBadge(false)

  return ok(await clearAll())
}

async function describeActiveTab(): Promise<Result<ActiveTabInfo>> {
  const tab = await queryActiveTab()

  if (!tab) {
    return fail('No active tab was found.')
  }

  const tabId = tab.id as number
  const reason = blockedReason(tab.url)

  return ok({
    tabId,
    pageUrl: tab.url ?? '',
    pageTitle: tab.title ?? '',
    viewportSize: (reason === null ? await readViewport(tabId) : null) ?? 'unavailable',
    recordable: reason === null,
    blockedReason: reason,
  })
}

async function focusRecordedTab(): Promise<Result<{ focused: boolean }>> {
  const state = await getState()

  if (state.tabId === null) {
    return ok({ focused: false })
  }

  try {
    const tab = await chrome.tabs.get(state.tabId)
    await chrome.tabs.update(state.tabId, { active: true })

    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }

    return ok({ focused: true })
  } catch {
    return fail('The recorded tab is no longer open.')
  }
}

async function handlePopupRequest(request: PopupRequest): Promise<PopupResponse> {
  switch (request.type) {
    case 'GET_STATE':
      return ok(await getState())
    case 'START_RECORDING':
      return startRecording()
    case 'STOP_RECORDING':
      return stopRecording()
    case 'RESET_RECORDING':
      return resetRecording()
  }
}

function handlePopupQuery(query: PopupQuery): Promise<Result<unknown>> {
  return query.type === 'GET_ACTIVE_TAB' ? describeActiveTab() : focusRecordedTab()
}

async function handleContentMessage(
  message: ContentToBackground,
  sender: chrome.runtime.MessageSender,
): Promise<Result<unknown>> {
  const state = await getState()
  const senderTabId = sender.tab?.id

  if (message.type === 'CONTENT_HELLO') {
    const isRecordedTab =
      state.status === 'recording' && senderTabId !== undefined && senderTabId === state.tabId

    if (isRecordedTab && state.sessionId !== null) {
      await installConsoleCapture(senderTabId, state.sessionId)
      return ok({ sessionId: state.sessionId })
    }

    return ok({ sessionId: null })
  }

  const isCurrentSession =
    state.status === 'recording' &&
    state.sessionId === message.sessionId &&
    senderTabId === state.tabId

  if (!isCurrentSession) {
    return ok({ received: true })
  }

  switch (message.type) {
    case 'RECORD_INTERACTION':
      await appendInteraction(message.sessionId, message.interaction)
      break
    case 'RECORD_CONSOLE_ERROR':
      await appendConsoleError(message.sessionId, message.error)
      break
    case 'RECORD_ENVIRONMENT':
      await setEnvironment(message.sessionId, message.environment)
      break
  }

  return ok({ received: true })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Background request failed.'
}

function respond(work: Promise<Result<unknown>>, sendResponse: (response: unknown) => void): true {
  work.then(sendResponse).catch((error: unknown) => sendResponse(fail(describe(error))))
  return true
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isContentToBackground(message)) {
    return respond(handleContentMessage(message, sender), sendResponse)
  }

  if (isPopupRequest(message)) {
    return respond(handlePopupRequest(message), sendResponse)
  }

  if (isPopupQuery(message)) {
    return respond(handlePopupQuery(message), sendResponse)
  }

  if (isJiraRequest(message)) {
    return respond(handleJiraRequest(message), sendResponse)
  }

  return false
})

chrome.runtime.onInstalled.addListener(() => {
  void clearAll().then(() => setBadge(false))
})

chrome.runtime.onStartup.addListener(() => {
  void clearAll().then(() => setBadge(false))
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void getState().then(async (state) => {
    if (state.tabId === tabId && state.status === 'recording') {
      await clearAll()
      await setBadge(false)
    }
  })
})

chrome.commands?.onCommand.addListener((command) => {
  if (command !== 'toggle-recording') {
    return
  }

  void getState().then((state) =>
    state.status === 'recording' ? stopRecording() : startRecording(),
  )
})

// Regenerating from the stored snapshot means output options can be changed
// after the fact without repeating the recording.
onSettingsChanged((settings) => {
  void getState().then((state) => {
    if (state.status === 'result' && state.snapshot) {
      void updateState({ report: generateReport(state.snapshot, settings) })
    }
  })
})
