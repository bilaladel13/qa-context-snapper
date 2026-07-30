import { sendToTab } from '@/messaging/client'
import { fail, isContentToBackground, isPopupRequest, ok } from '@/messaging/protocol'
import type {
  ContentToBackground,
  PopupRequest,
  PopupResponse,
  Result,
} from '@/messaging/protocol'
import { generateReport } from '@/generator'
import type { ContextSnapshot } from '@/types'
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
import { ensureContentScript, getActiveTab, installConsoleCapture } from './tabs'

const FALLBACK_ENVIRONMENT: ContextSnapshot['environment'] = {
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
    return started
  }

  return ok(state)
}

async function stopRecording(): Promise<PopupResponse> {
  const state = await getState()

  if (state.status !== 'recording' || state.sessionId === null) {
    return fail('There is no recording in progress.')
  }

  if (state.tabId !== null) {
    await sendToTab(state.tabId, {
      type: 'CONTENT_STOP_RECORDING',
      sessionId: state.sessionId,
    })
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

  return ok(
    await updateState({
      status: 'result',
      stoppedAt,
      snapshot,
      report: generateReport(snapshot),
      interactionCount: snapshot.interactions.length,
      consoleErrorCount: snapshot.consoleErrors.length,
    }),
  )
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
      return ok(await clearAll())
  }
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isContentToBackground(message)) {
    handleContentMessage(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(fail(describe(error))))

    return true
  }

  if (isPopupRequest(message)) {
    handlePopupRequest(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(fail(describe(error))))

    return true
  }

  return false
})

chrome.runtime.onInstalled.addListener(() => {
  void clearAll()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void getState().then((state) => {
    if (state.tabId === tabId && state.status === 'recording') {
      void clearAll()
    }
  })
})
