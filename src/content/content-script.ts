import { reportToBackground } from '@/messaging/client'
import { ok } from '@/messaging/protocol'
import type { ContentRequest, ContentResponse } from '@/messaging/protocol'
import { DEFAULT_SETTINGS, parseTestIdAttributes } from '@/settings/schema'
import type { CaptureSettings } from '@/settings/schema'
import { loadSettings, onSettingsChanged } from '@/settings/store'
import { MAX_VALUE_LENGTH } from '@/shared/constants'
import { captureEnvironment } from '@/shared/environment'
import { collapse } from '@/shared/text'
import type { ConsoleErrorEntry, InteractionEvent, InteractionType } from '@/types'
import type { AssertionDetail, ElementTarget } from '@/types'
import { CONSOLE_CHANNEL } from './bridge-protocol'
import type { BridgeControl, BridgeMessage } from './bridge-protocol'
import { closeInspector, isInspectorActive, isInspectorEvent, openInspector } from './inspector'
import { closeStepPrompt, isPromptEvent, isPromptOpen, openStepPrompt } from './prompt'
import { configureTestIdAttributes, resolveTarget } from './locator'

const INPUT_FLUSH_MS = 400
const MASK = '[redacted]'

let capture: CaptureSettings = DEFAULT_SETTINGS.capture

function applyCaptureSettings(next: CaptureSettings): void {
  capture = next
  configureTestIdAttributes(parseTestIdAttributes(next.testIdAttributes))
}

void loadSettings().then((settings) => applyCaptureSettings(settings.capture))
onSettingsChanged((settings) => applyCaptureSettings(settings.capture))

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, summary, option, [role], [tabindex], [onclick], [contenteditable]'

const TRACKED_KEYS = new Set(['Enter', 'Escape'])

const DISCRETE_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'date', 'time', 'color', 'range'])

interface Session {
  id: string
  lastUrl: string
  teardown: (() => void)[]
}

let session: Session | null = null
let pendingInput: { event: InteractionEvent; element: WeakRef<Element> } | null = null
let inputTimer: ReturnType<typeof setTimeout> | null = null
let idCounter = 0

function nextId(): string {
  idCounter += 1
  return `${Date.now().toString(36)}-${idCounter.toString(36)}`
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH - 1)}...` : value
}

function elementFromEvent(event: Event): Element | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  const candidate = path[0] ?? event.target
  return candidate instanceof Element ? candidate : null
}

// While the inspector is picking a target, the page is being inspected rather
// than used, so nothing it generates belongs in the recording.
function shouldIgnore(event: Event): boolean {
  return (
    isInspectorActive() ||
    isInspectorEvent(event) ||
    isPromptOpen() ||
    isPromptEvent(event)
  )
}

function isSensitive(input: HTMLInputElement): boolean {
  if (!capture.maskSensitive) {
    return false
  }

  if (input.type === 'password') {
    return true
  }

  const autocomplete = input.autocomplete.toLowerCase()
  const sensitiveHints = ['password', 'cc-', 'one-time-code']

  return (
    sensitiveHints.some((hint) => autocomplete.includes(hint)) || input.hasAttribute('data-sensitive')
  )
}

function readFieldValue(element: Element): { value: string; masked: boolean } | null {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'hidden') {
      return null
    }
    if (isSensitive(element)) {
      return { value: MASK, masked: true }
    }
    if (element.type === 'checkbox' || element.type === 'radio') {
      return { value: String(element.checked), masked: false }
    }
    if (element.type === 'file') {
      const names = Array.from(element.files ?? []).map((file) => file.name)
      return { value: names.join(', '), masked: false }
    }
    return { value: truncate(element.value), masked: false }
  }

  if (element instanceof HTMLTextAreaElement) {
    return { value: truncate(element.value), masked: false }
  }

  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions[0]
    const label = selected ? collapse(selected.textContent) || selected.value : element.value
    return { value: truncate(label), masked: false }
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return { value: truncate(collapse(element.textContent)), masked: false }
  }

  return null
}

function makeEvent(
  type: InteractionType,
  target: InteractionEvent['target'],
  extra: Partial<InteractionEvent> = {},
): InteractionEvent {
  return {
    id: nextId(),
    type,
    target,
    url: location.href,
    timestamp: Date.now(),
    ...extra,
  }
}

function send(interaction: InteractionEvent): void {
  if (!session) {
    return
  }

  void reportToBackground({ type: 'RECORD_INTERACTION', sessionId: session.id, interaction })
}

function flushPendingInput(): void {
  if (inputTimer !== null) {
    clearTimeout(inputTimer)
    inputTimer = null
  }

  if (!pendingInput) {
    return
  }

  const { event } = pendingInput
  pendingInput = null
  send(event)
}

function emit(interaction: InteractionEvent): void {
  flushPendingInput()
  send(interaction)
}

function noteNavigation(): void {
  if (!session || location.href === session.lastUrl) {
    return
  }

  session.lastUrl = location.href
  emit(makeEvent('navigation', null, { value: location.href }))
}

function handleClick(event: MouseEvent): void {
  const element = elementFromEvent(event)
  if (!element || shouldIgnore(event)) {
    return
  }

  noteNavigation()
  emit(makeEvent('click', resolveTarget(element.closest(INTERACTIVE_SELECTOR) ?? element)))
}

function handleInput(event: Event): void {
  const element = elementFromEvent(event)
  if (!element || !session || shouldIgnore(event)) {
    return
  }

  const field = readFieldValue(element)
  if (!field) {
    return
  }

  noteNavigation()

  const interaction = makeEvent('input', resolveTarget(element), {
    value: field.value,
    masked: field.masked,
  })

  if (pendingInput && pendingInput.element.deref() === element) {
    pendingInput.event = interaction
  } else {
    flushPendingInput()
    pendingInput = { event: interaction, element: new WeakRef(element) }
  }

  if (inputTimer !== null) {
    clearTimeout(inputTimer)
  }

  inputTimer = setTimeout(flushPendingInput, INPUT_FLUSH_MS)
}

function handleChange(event: Event): void {
  const element = elementFromEvent(event)
  if (!element || shouldIgnore(event)) {
    return
  }

  const isDiscrete =
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLInputElement && DISCRETE_INPUT_TYPES.has(element.type))

  if (!isDiscrete) {
    return
  }

  const field = readFieldValue(element)
  if (!field) {
    return
  }

  noteNavigation()
  emit(makeEvent('change', resolveTarget(element), { value: field.value, masked: field.masked }))
}

function handleSubmit(event: SubmitEvent): void {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || shouldIgnore(event)) {
    return
  }

  noteNavigation()
  emit(makeEvent('submit', resolveTarget(form)))
}

function handleKeydown(event: KeyboardEvent): void {
  if (!capture.trackKeyboard || event.repeat || !TRACKED_KEYS.has(event.key)) {
    return
  }

  if (shouldIgnore(event)) {
    return
  }

  const element = elementFromEvent(event)

  noteNavigation()
  emit(makeEvent('keydown', element ? resolveTarget(element) : null, { key: event.key }))
}

function recordAssertion(target: ElementTarget | null, assertion: AssertionDetail): void {
  if (!session) {
    return
  }

  emit(makeEvent('assertion', target, { assertion }))
}

function promptForStepMarker(): boolean {
  if (!session) {
    return false
  }

  openStepPrompt((label) => emit(makeEvent('marker', null, { value: label })))

  return true
}

function setAssertionMode(active: boolean): boolean {
  if (!session || !active) {
    closeInspector()
    return false
  }

  openInspector({ onAssert: recordAssertion, onExit: () => undefined })

  return true
}

function handleBridgeMessage(event: MessageEvent): void {
  if (event.source !== window || !session) {
    return
  }

  const data = event.data as Partial<BridgeMessage> | undefined
  if (!data?.payload || data.channel !== CONSOLE_CHANNEL || data.sessionId !== session.id) {
    return
  }

  const payload = data.payload

  if (payload.kind === 'network') {
    if (!capture.trackNetwork) {
      return
    }

    void reportToBackground({
      type: 'RECORD_NETWORK',
      sessionId: session.id,
      entry: {
        id: nextId(),
        method: payload.method,
        url: payload.url,
        status: payload.status,
        outcome: payload.outcome,
        durationMs: payload.durationMs,
        timestamp: payload.timestamp,
      },
    })

    return
  }

  const error: ConsoleErrorEntry = {
    id: nextId(),
    level: payload.level,
    origin: payload.origin,
    message: payload.message,
    stack: payload.stack,
    source: payload.source,
    lineNumber: payload.lineNumber,
    columnNumber: payload.columnNumber,
    timestamp: payload.timestamp,
  }

  void reportToBackground({ type: 'RECORD_CONSOLE_ERROR', sessionId: session.id, error })
}

function setBridgeSession(sessionId: string | null): void {
  const control: BridgeControl = { channel: CONSOLE_CHANNEL, control: 'set-session', sessionId }
  window.postMessage(control, '*')
}

function attachListeners(teardown: (() => void)[]): void {
  const onDocument = <K extends keyof DocumentEventMap>(
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ) => {
    document.addEventListener(type, handler, true)
    teardown.push(() => document.removeEventListener(type, handler, true))
  }

  onDocument('click', handleClick)
  onDocument('input', handleInput)
  onDocument('change', handleChange)
  onDocument('submit', handleSubmit)
  onDocument('keydown', handleKeydown)

  const onNavigation = () => noteNavigation()
  const onHide = () => flushPendingInput()

  window.addEventListener('message', handleBridgeMessage)
  window.addEventListener('popstate', onNavigation)
  window.addEventListener('hashchange', onNavigation)
  window.addEventListener('pagehide', onHide)

  teardown.push(() => {
    window.removeEventListener('message', handleBridgeMessage)
    window.removeEventListener('popstate', onNavigation)
    window.removeEventListener('hashchange', onNavigation)
    window.removeEventListener('pagehide', onHide)
  })
}

function stopRecording(): void {
  if (!session) {
    return
  }

  closeInspector()
  closeStepPrompt()
  flushPendingInput()

  for (const dispose of session.teardown) {
    dispose()
  }

  setBridgeSession(null)
  pendingInput = null
  session = null
}

function startRecording(sessionId: string, isResume: boolean): void {
  stopRecording()

  const teardown: (() => void)[] = []
  session = { id: sessionId, lastUrl: location.href, teardown }
  attachListeners(teardown)

  void captureEnvironment().then((environment) => {
    if (session?.id === sessionId) {
      void reportToBackground({ type: 'RECORD_ENVIRONMENT', sessionId, environment })
    }
  })

  if (isResume) {
    emit(makeEvent('navigation', null, { value: location.href }))
  }
}

function isContentRequest(value: unknown): value is ContentRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { type } = value as { type?: unknown }

  return (
    type === 'CONTENT_PING' ||
    type === 'CONTENT_START_RECORDING' ||
    type === 'CONTENT_STOP_RECORDING' ||
    type === 'CONTENT_TOGGLE_ASSERTION_MODE' ||
    type === 'CONTENT_PROMPT_STEP_MARKER'
  )
}

function handleRequest(request: ContentRequest): ContentResponse {
  switch (request.type) {
    case 'CONTENT_START_RECORDING':
      startRecording(request.sessionId, false)
      break
    case 'CONTENT_STOP_RECORDING':
      stopRecording()
      break
    case 'CONTENT_TOGGLE_ASSERTION_MODE':
      return ok({ acknowledged: true, assertionMode: setAssertionMode(!isInspectorActive()) })
    case 'CONTENT_PROMPT_STEP_MARKER':
      return ok({ acknowledged: true, prompted: promptForStepMarker() })
    case 'CONTENT_PING':
      break
  }

  return ok({ acknowledged: true })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isContentRequest(message)) {
    return false
  }

  sendResponse(handleRequest(message))
  return false
})

void reportToBackground({ type: 'CONTENT_HELLO' }).then((response) => {
  if (response.ok && response.data.sessionId) {
    startRecording(response.data.sessionId, true)
  }
})
