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

  // A bearer token or signature in a query string would otherwise travel into a
  // bug report and a Jira ticket.
  const SENSITIVE = /token|key|secret|password|auth|session|signature|sig|code/i

  const cleanUrl = (input: unknown): string => {
    const raw = String(input ?? '')

    try {
      const parsed = new URL(raw, location.href)

      parsed.searchParams.forEach((_value, name) => {
        if (SENSITIVE.test(name)) parsed.searchParams.set(name, 'redacted')
      })

      return parsed.toString().slice(0, 500)
    } catch {
      return raw.split('?')[0].slice(0, 500)
    }
  }

  const reportRequest = (
    method: string,
    url: unknown,
    status: number | null,
    startedAt: number,
  ): void => {
    post({
      kind: 'network',
      method: String(method || 'GET').toUpperCase(),
      url: cleanUrl(url),
      status,
      outcome: status === null ? 'error' : status >= 400 ? 'failed' : 'success',
      durationMs: Math.max(0, Math.round(Date.now() - startedAt)),
      timestamp: Date.now(),
    })
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
            kind: 'console',
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

  // fetch and XHR are patched here rather than in the isolated world for the
  // same reason console is: the page holds a different function object, so a
  // patch applied over there would observe none of its traffic.
  const originalFetch = window.fetch

  const patchedFetch = function (this: unknown, ...args: unknown[]) {
    const startedAt = Date.now()
    const request = args[0] as { url?: string; method?: string } | string
    const init = args[1] as { method?: string } | undefined

    const url = typeof request === 'string' ? request : (request?.url ?? String(request))
    const method = init?.method ?? (typeof request === 'object' ? request?.method : '') ?? 'GET'

    return (originalFetch as (...a: unknown[]) => Promise<Response>)
      .apply(this, args)
      .then((response: Response) => {
        try {
          reportRequest(method, url, response.status, startedAt)
        } catch {
          // Never let reporting interfere with the page's own request.
        }
        return response
      })
      .catch((error: unknown) => {
        try {
          reportRequest(method, url, null, startedAt)
        } catch {
          // As above.
        }
        throw error
      })
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  const patchedOpen = function (this: XMLHttpRequest, ...args: unknown[]) {
    const record = this as XMLHttpRequest & { __qaMethod?: string; __qaUrl?: string }
    record.__qaMethod = String(args[0] ?? 'GET')
    record.__qaUrl = String(args[1] ?? '')

    return (originalOpen as (...a: unknown[]) => void).apply(this, args)
  }

  const patchedSend = function (this: XMLHttpRequest, ...args: unknown[]) {
    const record = this as XMLHttpRequest & { __qaMethod?: string; __qaUrl?: string }
    const startedAt = Date.now()

    this.addEventListener('loadend', () => {
      try {
        // status stays 0 when the request never reached a response at all.
        const status = this.status === 0 ? null : this.status
        reportRequest(record.__qaMethod ?? 'GET', record.__qaUrl, status, startedAt)
      } catch {
        // As above.
      }
    })

    return (originalSend as (...a: unknown[]) => void).apply(this, args)
  }

  const onError = (event: ErrorEvent): void => {
    post({
      kind: 'console',
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
      kind: 'console',
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
    if (window.fetch === patchedFetch) window.fetch = originalFetch
    if (XMLHttpRequest.prototype.open === patchedOpen) XMLHttpRequest.prototype.open = originalOpen
    if (XMLHttpRequest.prototype.send === patchedSend) XMLHttpRequest.prototype.send = originalSend
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
  window.fetch = patchedFetch as typeof window.fetch
  XMLHttpRequest.prototype.open = patchedOpen as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = patchedSend as typeof XMLHttpRequest.prototype.send
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
