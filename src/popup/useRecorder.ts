import { useCallback, useEffect, useRef, useState } from 'react'
import { queryBackground, sendToBackground } from '@/messaging/client'
import { isBackgroundBroadcast } from '@/messaging/protocol'
import type { PopupRequest } from '@/messaging/protocol'
import type { RecorderState } from '@/types'

export interface Recorder {
  state: RecorderState | null
  error: string | null
  pending: boolean
  start: () => void
  stop: () => void
  reset: () => void
  focusTab: () => void
  dismissError: () => void
}

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const dispatch = useCallback(async (request: PopupRequest) => {
    setPending(true)

    const response = await sendToBackground(request)

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setState(response.data)
      setError(null)
    } else {
      setError(response.error)
    }

    setPending(false)
  }, [])

  useEffect(() => {
    void dispatch({ type: 'GET_STATE' })
  }, [dispatch])

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isBackgroundBroadcast(message)) {
        setState(message.state)
      }
    }

    chrome.runtime.onMessage.addListener(listener)

    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const focusTab = useCallback(() => {
    void queryBackground({ type: 'FOCUS_RECORDED_TAB' }).then((response) => {
      if (response.ok) {
        window.close()
      } else if (mounted.current) {
        setError(response.error)
      }
    })
  }, [])

  return {
    state,
    error,
    pending,
    start: useCallback(() => void dispatch({ type: 'START_RECORDING' }), [dispatch]),
    stop: useCallback(() => void dispatch({ type: 'STOP_RECORDING' }), [dispatch]),
    reset: useCallback(() => void dispatch({ type: 'RESET_RECORDING' }), [dispatch]),
    focusTab,
    dismissError: useCallback(() => setError(null), []),
  }
}
