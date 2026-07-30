import { useCallback, useEffect, useState } from 'react'
import { sendToBackground } from '@/messaging/client'
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
  dismissError: () => void
}

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const dispatch = useCallback(async (request: PopupRequest) => {
    setPending(true)

    const response = await sendToBackground(request)

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

  return {
    state,
    error,
    pending,
    start: useCallback(() => void dispatch({ type: 'START_RECORDING' }), [dispatch]),
    stop: useCallback(() => void dispatch({ type: 'STOP_RECORDING' }), [dispatch]),
    reset: useCallback(() => void dispatch({ type: 'RESET_RECORDING' }), [dispatch]),
    dismissError: useCallback(() => setError(null), []),
  }
}
