import { sendToTab } from '@/messaging/client'
import {
  fail,
  isContentToBackground,
  isDownloadRequest,
  isJiraRequest,
  isPopupQuery,
  isPopupRequest,
  isQaseRequest,
  ok,
} from '@/messaging/protocol'
import { startDownload } from './downloads'
import { handleJiraRequest } from './jira'
import { handleQaseRequest } from './qase'
import type {
  ActiveTabInfo,
  ContentToBackground,
  PopupQuery,
  PopupRequest,
  PopupResponse,
  Result,
} from '@/messaging/protocol'
import { generateReport } from '@/generator'
import { cleanAndDeduplicateInteractions } from '@/generator/shared'
import { loadSettings, onSettingsChanged } from '@/settings/store'
import type { ContextSnapshot, EnvironmentSnapshot, RecorderState } from '@/types'
import { captureTab } from './screenshot'
import {
  appendConsoleError,
  appendInteraction,
  appendNetwork,
  beginSession,
  clearAll,
  getBuffer,
  getState,
  readScreenshot,
  removeStep,
  updateStep,
  updateSessionTitle,
  setEnvironment,
  updateState,
  writeScreenshot,
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

async function startRecording(qaseContext?: {
  projectCode?: string | null
  suiteId?: number | null
  caseId?: number | null
  caseTitle?: string | null
}): Promise<PopupResponse> {
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

  const qaseCaseCode =
    qaseContext?.caseId && qaseContext?.projectCode
      ? `${qaseContext.projectCode}-${qaseContext.caseId}`
      : null

  const state = await beginSession(sessionId, {
    status: 'recording',
    tabId,
    tabUrl: tab.data.url ?? null,
    tabTitle: tab.data.title ?? null,
    startedAt: Date.now(),
    qaseProjectCode: qaseContext?.projectCode ?? null,
    qaseSuiteId: qaseContext?.suiteId ?? null,
    qaseCaseId: qaseContext?.caseId ?? null,
    qaseCaseTitle: qaseContext?.caseTitle ?? null,
    qaseCaseCode,
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

  // Taken now rather than when a ticket is filed. By then the tester may have
  // navigated on, dismissed the toast or cleared the error, and the visual
  // state worth capturing is the one at the moment they stopped.
  const capture = state.tabId === null ? null : await captureTab(state.tabId)

  await writeScreenshot(capture?.ok ? capture.data.dataUrl : null)

  const buffer = await getBuffer()
  const stoppedAt = Date.now()

  const qaseCaseCode =
    state.qaseCaseCode ||
    (state.qaseProjectCode && state.qaseCaseId
      ? `${state.qaseProjectCode}-${state.qaseCaseId}`
      : null)

  const sessionTitle = state.qaseCaseTitle
    ? (qaseCaseCode && !state.qaseCaseTitle.includes(qaseCaseCode)
        ? `[${qaseCaseCode}] ${state.qaseCaseTitle}`
        : state.qaseCaseTitle)
    : (state.tabTitle || 'QA Recording Session')

  const rawInteractions = buffer?.interactions ?? []
  const cleanInteractions = cleanAndDeduplicateInteractions(rawInteractions)

  const snapshot: ContextSnapshot = {
    sessionId: state.sessionId,
    environment: buffer?.environment ?? {
      ...FALLBACK_ENVIRONMENT,
      pageUrl: state.tabUrl ?? '',
      pageTitle: sessionTitle,
    },
    interactions: cleanInteractions,
    consoleErrors: buffer?.consoleErrors ?? [],
    network: buffer?.network ?? [],
    startedAt: state.startedAt ?? stoppedAt,
    stoppedAt,
    sessionTitle,
    qaseCaseCode,
    qaseProjectCode: state.qaseProjectCode,
    qaseSuiteId: state.qaseSuiteId,
    qaseCaseId: state.qaseCaseId,
    qaseCaseTitle: state.qaseCaseTitle,
  }

  await setBadge(false)

  const settings = await loadSettings()
  const report = generateReport(snapshot, {
    ...settings,
    playwright: { ...settings.playwright, testTitle: sessionTitle },
  })

  return ok(
    await updateState({
      status: 'result',
      stoppedAt,
      snapshot,
      sessionTitle,
      qaseCaseCode,
      qaseProjectCode: state.qaseProjectCode,
      qaseSuiteId: state.qaseSuiteId,
      qaseCaseId: state.qaseCaseId,
      qaseCaseTitle: state.qaseCaseTitle,
      screenshot: capture?.ok ? capture.data.meta : null,
      screenshotError: capture && !capture.ok ? capture.error : null,
      report,
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
      return startRecording(request.qaseContext)
    case 'STOP_RECORDING':
      return stopRecording()
    case 'RESET_RECORDING':
      return resetRecording()
    case 'DELETE_STEP':
      return ok(await removeStep(request.stepId))
    case 'UPDATE_STEP':
      return ok(await updateStep(request.stepId, request.patch))
    case 'UPDATE_SESSION_TITLE':
      return ok(await updateSessionTitle(request.title))
    case 'LOAD_DEMO_RESULT':
      return loadDemoResult()
  }
}

async function loadDemoResult(): Promise<PopupResponse> {
  const startedAt = Date.now() - 25000
  const stoppedAt = Date.now()
  const sessionTitle = '[SQA-3] [Negative] Reject invalid email format'
  const snapshot: ContextSnapshot = {
    sessionId: 'demo-session',
    startedAt,
    stoppedAt,
    sessionTitle,
    qaseCaseCode: 'SQA-3',
    qaseProjectCode: 'SQA',
    qaseCaseId: 3,
    qaseCaseTitle: '[Negative] Reject invalid email format',
    environment: {
      browser: 'Google Chrome',
      browserVersion: '141.0.0.0',
      os: 'Windows 11',
      screenSize: '1920x1080',
      viewportSize: '1280x720',
      devicePixelRatio: 1,
      language: 'ar-SA',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      pageUrl: 'http://localhost:5173/?qaBugMode=1',
      pageTitle: 'Member Directory & Registration',
      capturedAt: new Date(startedAt).toISOString(),
    },
    interactions: [
      {
        id: 'step-nav',
        type: 'navigation',
        target: null,
        value: 'http://localhost:5173/?qaBugMode=1',
        url: 'http://localhost:5173/?qaBugMode=1',
        timestamp: startedAt + 1000,
      },
      {
        id: 'step-click-email',
        type: 'click',
        target: {
          strategy: 'css',
          value: '#member-email',
          tagName: 'input',
          cssSelector: '#member-email',
        },
        url: 'http://localhost:5173/?qaBugMode=1',
        timestamp: startedAt + 3000,
      },
      {
        id: 'step-type-email',
        type: 'input',
        target: {
          strategy: 'css',
          value: '#member-email',
          tagName: 'input',
          cssSelector: '#member-email',
        },
        value: 'محمد',
        url: 'http://localhost:5173/?qaBugMode=1',
        timestamp: startedAt + 4500,
      },
      {
        id: 'step-click-submit',
        type: 'click',
        target: {
          strategy: 'role',
          value: 'button',
          accessibleName: 'Add Member',
          tagName: 'button',
          cssSelector: 'button#btn-submit',
        },
        url: 'http://localhost:5173/?qaBugMode=1',
        timestamp: startedAt + 7000,
      },
      {
        id: 'step-assert-hidden',
        type: 'assertion',
        target: {
          strategy: 'text',
          value: 'محمد',
          tagName: 'td',
          cssSelector: 'td.member-name',
        },
        assertion: {
          kind: 'hidden',
          expected: 'hidden',
          actual: 'visible',
          isViolation: true,
          message: 'Element "member-name" with text "محمد" should be hidden / not exist',
        },
        url: 'http://localhost:5173/?qaBugMode=1',
        timestamp: startedAt + 8500,
      },
    ],
    consoleErrors: [
      {
        id: 'err-1',
        level: 'error',
        origin: 'console',
        message: 'Validation failed: Invalid email format (missing @domain)',
        source: 'app.js',
        lineNumber: 42,
        timestamp: startedAt + 7500,
      },
    ],
    network: [
      {
        id: 'net-1',
        method: 'POST',
        url: 'http://localhost:5173/api/members',
        status: 422,
        outcome: 'failed',
        durationMs: 85,
        timestamp: startedAt + 7200,
      },
    ],
  }

  const settings = await loadSettings()
  const report = generateReport(snapshot, {
    ...settings,
    playwright: { ...settings.playwright, testTitle: sessionTitle },
  })
  const next: RecorderState = {
    status: 'result',
    sessionId: 'demo-session',
    tabId: null,
    tabUrl: snapshot.environment.pageUrl,
    tabTitle: snapshot.environment.pageTitle,
    startedAt,
    stoppedAt,
    interactionCount: snapshot.interactions.length,
    consoleErrorCount: snapshot.consoleErrors.length,
    networkFailureCount: 1,
    snapshot,
    screenshot: null,
    screenshotError: null,
    report,
    sessionTitle,
    qaseCaseCode: 'SQA-3',
    qaseProjectCode: 'SQA',
    qaseCaseId: 3,
    qaseCaseTitle: '[Negative] Reject invalid email format',
  }
  await updateState(next)
  return ok(next)
}

async function toggleAssertionMode(): Promise<Result<{ assertionMode: boolean }>> {
  const state = await getState()

  if (state.status !== 'recording' || state.tabId === null) {
    return fail('Start a recording before adding assertions.')
  }

  const response = await sendToTab(state.tabId, { type: 'CONTENT_TOGGLE_ASSERTION_MODE' })

  return response.ok
    ? ok({ assertionMode: response.data.assertionMode })
    : fail('The recorded page did not respond. Reload it and start again.')
}

async function promptStepMarker(): Promise<Result<{ prompted: boolean }>> {
  const state = await getState()

  if (state.status !== 'recording' || state.tabId === null) {
    return fail('Start a recording before naming a step.')
  }

  const response = await sendToTab(state.tabId, { type: 'CONTENT_PROMPT_STEP_MARKER' })

  return response.ok
    ? ok({ prompted: response.data.prompted })
    : fail('The recorded page did not respond. Reload it and start again.')
}

async function handlePopupQuery(query: PopupQuery): Promise<Result<unknown>> {
  switch (query.type) {
    case 'GET_ACTIVE_TAB':
      return describeActiveTab()
    case 'FOCUS_RECORDED_TAB':
      return focusRecordedTab()
    case 'TOGGLE_ASSERTION_MODE':
      return toggleAssertionMode()
    case 'GET_SCREENSHOT':
      return ok({ dataUrl: await readScreenshot() })
    case 'ADD_STEP_MARKER':
      return promptStepMarker()
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
    case 'RECORD_NETWORK':
      await appendNetwork(message.sessionId, message.entry)
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

  if (isQaseRequest(message)) {
    return respond(handleQaseRequest(message), sendResponse)
  }

  if (isDownloadRequest(message)) {
    return respond(
      startDownload({ content: message.content, filename: message.filename }),
      sendResponse,
    )
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
  if (command === 'toggle-assertion-mode') {
    void toggleAssertionMode()
    return
  }

  if (command === 'add-step-marker') {
    void promptStepMarker()
    return
  }

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
