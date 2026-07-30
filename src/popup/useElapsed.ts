import { useEffect, useState } from 'react'

export function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) {
      return
    }

    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)

    return () => window.clearInterval(id)
  }, [startedAt])

  if (startedAt === null) {
    return '00:00'
  }

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)

  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
