import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '@/settings/schema'
import type { Settings } from '@/settings/schema'
import { loadSettings, resetSettings, saveSettings } from '@/settings/store'

export interface SettingsController {
  settings: Settings
  ready: boolean
  update: (patch: (current: Settings) => Settings) => void
  reset: () => void
}

export function useSettings(): SettingsController {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    void loadSettings().then((loaded) => {
      if (active) {
        setSettings(loaded)
        setReady(true)
      }
    })

    return () => {
      active = false
    }
  }, [])

  // The popup is the only writer, so it holds the authoritative value and does
  // not subscribe to its own echo, which would clobber in-flight typing.
  // Writes are not debounced: a popup can close at any moment and a pending
  // timer would drop the change.
  const update = useCallback((patch: (current: Settings) => Settings) => {
    setSettings((current) => {
      const next = patch(current)
      void saveSettings(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    void resetSettings().then(setSettings)
  }, [])

  return { settings, ready, update, reset }
}
