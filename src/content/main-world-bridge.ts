export function installConsoleBridge(channel: string, sessionId: string): void {
  const scope = window as unknown as Record<string, unknown>
  const registryKey = `__qaContextSnapper:${channel}`
  const installed = scope[registryKey] as { setSession(id: string | null): void } | undefined

  if (installed) {
    installed.setSession(sessionId)
    return
  }

  const MAX_MESSAGE_LENGTH = 2000
  let active: string | null = sessionId

  const stringify = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (value instanceof Error) return `${value.name}: ${value.message}`
    if (typeof value !== 'object') return String(value)
    if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`

    try {
      const seen = new WeakSet<object>()
      const json = JSON.stringify(value, (_key, nested: unknown) => {
        if (nested instanceof Error) return `${nested.name}: ${nested.message}`
        if (typeof nested === 'object' && nested !== null) {
          if (seen.has(nested)) return '[Circular]'
          seen.add(nested)
        }
        return nested
      })
      return json ?? String(value)
    } catch {
      return String(value)
    }
  }

  const post = (payload: Record<string, unknown>): void => {
    if (!active) return
    try {
      window.postMessage({ channel, sessionId: active, payload }, '*')
    } catch {
      // A serialization failure must never break the host page.
    }
  }

  const originalError = console.error
  const originalWarn = console.warn

  const forward = (level: string) => {
    return function (this: unknown, ...args: unknown[]): void {
      try {
        if (active) {
          let stack: string | undefined
          for (const arg of args) {
            if (arg instanceof Error && arg.stack) {
              stack = arg.stack
              break
            }
          }
          post({
            level,
            origin: 'console',
            message: args.map(stringify).join(' ').slice(0, MAX_MESSAGE_LENGTH),
            stack,
            timestamp: Date.now(),
          })
        }
      } catch {
        // Fall through to the original console call.
      }

      const original = level === 'warn' ? originalWarn : originalError
      original.apply(this, args)
    }
  }

  const patchedError = forward('error')
  const patchedWarn = forward('warn')

  const onError = (event: ErrorEvent): void => {
    post({
      level: 'error',
      origin: 'window',
      message: (event.message || 'Uncaught error').slice(0, MAX_MESSAGE_LENGTH),
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
      timestamp: Date.now(),
    })
  }

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason: unknown = event.reason
    post({
      level: 'unhandledrejection',
      origin: 'window',
      message: `Unhandled promise rejection: ${stringify(reason)}`.slice(0, MAX_MESSAGE_LENGTH),
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now(),
    })
  }

  const uninstall = (): void => {
    if (console.error === patchedError) console.error = originalError
    if (console.warn === patchedWarn) console.warn = originalWarn
    window.removeEventListener('error', onError, true)
    window.removeEventListener('unhandledrejection', onRejection, true)
    window.removeEventListener('message', onControl)
    delete scope[registryKey]
  }

  function onControl(event: MessageEvent): void {
    if (event.source !== window) return
    const data = event.data as { channel?: string; control?: string; sessionId?: string | null }
    if (!data || data.channel !== channel || data.control !== 'set-session') return

    active = data.sessionId ?? null
    if (active === null) uninstall()
  }

  console.error = patchedError
  console.warn = patchedWarn
  window.addEventListener('error', onError, true)
  window.addEventListener('unhandledrejection', onRejection, true)
  window.addEventListener('message', onControl)

  scope[registryKey] = {
    setSession(id: string | null) {
      active = id
      if (id === null) uninstall()
    },
  }
}
