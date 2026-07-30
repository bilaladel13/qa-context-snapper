import { useEffect, useState } from 'react'

export const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts'

export function useShortcut(command: string): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    chrome.commands
      ?.getAll()
      .then((commands) => {
        if (active) {
          setShortcut(commands.find((entry) => entry.name === command)?.shortcut || null)
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [command])

  return shortcut
}
