import { DEFAULT_SETTINGS, normalizeSettings } from './schema'
import type { Settings } from './schema'

export const SETTINGS_KEY = 'settings'

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY)
    return normalizeSettings(stored[SETTINGS_KEY])
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const normalized = normalizeSettings(settings)
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalized })
  return normalized
}

export function resetSettings(): Promise<Settings> {
  return saveSettings(DEFAULT_SETTINGS)
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !(SETTINGS_KEY in changes)) {
      return
    }

    listener(normalizeSettings(changes[SETTINGS_KEY]?.newValue))
  }

  chrome.storage.onChanged.addListener(handler)

  return () => chrome.storage.onChanged.removeListener(handler)
}
