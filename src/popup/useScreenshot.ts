import { useEffect, useState } from 'react'
import { queryBackground } from '@/messaging/client'

// Fetched on demand rather than carried in RecorderState, which is broadcast on
// every counter tick during a recording.
export function useScreenshot(available: boolean): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!available) {
      setDataUrl(null)
      return
    }

    let active = true

    void queryBackground({ type: 'GET_SCREENSHOT' }).then((response) => {
      if (active && response.ok) {
        setDataUrl(response.data.dataUrl)
      }
    })

    return () => {
      active = false
    }
  }, [available])

  return dataUrl
}
