import type { BackgroundBroadcast } from '@/messaging/protocol'
import type {
  ConsoleErrorEntry,
  EnvironmentSnapshot,
  InteractionEvent,
  NetworkEntry,
  RecorderState,
} from '@/types'

const STATE_KEY = 'recorderState'
const BUFFER_KEY = 'recorderBuffer'
const SCREENSHOT_KEY = 'recorderScreenshot'

const MAX_INTERACTIONS = 1000
const MAX_CONSOLE_ERRORS = 300
const MAX_NETWORK_ENTRIES = 400

export interface RecordingBuffer {
  sessionId: string
  environment: EnvironmentSnapshot | null
  interactions: InteractionEvent[]
  consoleErrors: ConsoleErrorEntry[]
  network: NetworkEntry[]
}

export const INITIAL_STATE: RecorderState = {
  status: 'idle',
  sessionId: null,
  tabId: null,
  tabUrl: null,
  tabTitle: null,
  startedAt: null,
  stoppedAt: null,
  interactionCount: 0,
  consoleErrorCount: 0,
  networkFailureCount: 0,
  snapshot: null,
  screenshot: null,
  screenshotError: null,
  report: null,
}

// Every mutation is a read-modify-write against session storage. The service
// worker interleaves those freely, so they are queued behind a single chain.
let lock: Promise<unknown> = Promise.resolve()

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lock.then(task, task)
  lock = run.catch(() => undefined)
  return run
}

function broadcast(state: RecorderState): void {
  const message: BackgroundBroadcast = { type: 'STATE_CHANGED', state }

  chrome.runtime.sendMessage(message).catch(() => {
    // The popup is the only listener and is closed most of the time.
  })
}

async function loadState(): Promise<RecorderState> {
  const stored = await chrome.storage.session.get(STATE_KEY)
  const value = stored[STATE_KEY] as RecorderState | undefined

  return value ? { ...INITIAL_STATE, ...value } : INITIAL_STATE
}

async function loadBuffer(): Promise<RecordingBuffer | null> {
  const stored = await chrome.storage.session.get(BUFFER_KEY)
  return (stored[BUFFER_KEY] as RecordingBuffer | undefined) ?? null
}

export function getState(): Promise<RecorderState> {
  return withLock(loadState)
}

export function getBuffer(): Promise<RecordingBuffer | null> {
  return withLock(loadBuffer)
}

export function updateState(patch: Partial<RecorderState>): Promise<RecorderState> {
  return withLock(async () => {
    const next = { ...(await loadState()), ...patch }
    await chrome.storage.session.set({ [STATE_KEY]: next })
    broadcast(next)
    return next
  })
}

export function beginSession(
  sessionId: string,
  patch: Partial<RecorderState>,
): Promise<RecorderState> {
  return withLock(async () => {
    const buffer: RecordingBuffer = {
      sessionId,
      environment: null,
      interactions: [],
      consoleErrors: [],
      network: [],
    }

    const next: RecorderState = { ...INITIAL_STATE, ...patch, sessionId }

    await chrome.storage.session.remove(SCREENSHOT_KEY)
    await chrome.storage.session.set({ [BUFFER_KEY]: buffer, [STATE_KEY]: next })
    broadcast(next)

    return next
  })
}

// Kept apart from RecorderState so the image is never broadcast, and read only
// when something actually needs the pixels.
export function readScreenshot(): Promise<string | null> {
  return withLock(async () => {
    const stored = await chrome.storage.session.get(SCREENSHOT_KEY)
    return (stored[SCREENSHOT_KEY] as string | undefined) ?? null
  })
}

export function writeScreenshot(dataUrl: string | null): Promise<void> {
  return withLock(async () => {
    if (dataUrl === null) {
      await chrome.storage.session.remove(SCREENSHOT_KEY)
      return
    }

    await chrome.storage.session.set({ [SCREENSHOT_KEY]: dataUrl })
  })
}

export function clearAll(): Promise<RecorderState> {
  return withLock(async () => {
    await chrome.storage.session.remove([BUFFER_KEY, SCREENSHOT_KEY])
    await chrome.storage.session.set({ [STATE_KEY]: INITIAL_STATE })
    broadcast(INITIAL_STATE)
    return INITIAL_STATE
  })
}

async function mutateBuffer(
  sessionId: string,
  mutate: (buffer: RecordingBuffer) => void,
): Promise<void> {
  const buffer = await loadBuffer()

  if (!buffer || buffer.sessionId !== sessionId) {
    return
  }

  mutate(buffer)

  const state = await loadState()

  if (state.sessionId !== sessionId) {
    await chrome.storage.session.set({ [BUFFER_KEY]: buffer })
    return
  }

  const next: RecorderState = {
    ...state,
    interactionCount: buffer.interactions.length,
    consoleErrorCount: buffer.consoleErrors.length,
    networkFailureCount: buffer.network.filter((entry) => entry.outcome !== 'success').length,
  }

  await chrome.storage.session.set({ [BUFFER_KEY]: buffer, [STATE_KEY]: next })
  broadcast(next)
}

export function appendInteraction(
  sessionId: string,
  interaction: InteractionEvent,
): Promise<void> {
  return withLock(() =>
    mutateBuffer(sessionId, (buffer) => {
      const last = buffer.interactions[buffer.interactions.length - 1]

      if (
        last &&
        last.type === 'input' &&
        interaction.type === 'input' &&
        last.target?.cssSelector === interaction.target?.cssSelector
      ) {
        buffer.interactions[buffer.interactions.length - 1] = interaction
        return
      }

      if (buffer.interactions.length >= MAX_INTERACTIONS) {
        return
      }

      buffer.interactions.push(interaction)
    }),
  )
}

export function appendConsoleError(sessionId: string, error: ConsoleErrorEntry): Promise<void> {
  return withLock(() =>
    mutateBuffer(sessionId, (buffer) => {
      if (buffer.consoleErrors.length >= MAX_CONSOLE_ERRORS) {
        buffer.consoleErrors.shift()
      }

      buffer.consoleErrors.push(error)
    }),
  )
}

// Successful requests are kept as well, so the report can say how much traffic
// a failure sat among rather than showing it with no context.
export function appendNetwork(sessionId: string, entry: NetworkEntry): Promise<void> {
  return withLock(() =>
    mutateBuffer(sessionId, (buffer) => {
      buffer.network ??= []

      if (buffer.network.length >= MAX_NETWORK_ENTRIES) {
        const firstSuccess = buffer.network.findIndex((item) => item.outcome === 'success')

        // Drop a success before ever dropping a failure.
        buffer.network.splice(firstSuccess === -1 ? 0 : firstSuccess, 1)
      }

      buffer.network.push(entry)
    }),
  )
}

export function setEnvironment(
  sessionId: string,
  environment: EnvironmentSnapshot,
): Promise<void> {
  return withLock(() =>
    mutateBuffer(sessionId, (buffer) => {
      buffer.environment ??= environment
    }),
  )
}
