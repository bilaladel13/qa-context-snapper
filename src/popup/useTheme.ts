import { useEffect } from 'react'
import type { ThemePreference } from '@/settings/schema'

// Tokens resolve through light-dark(), so the only job here is to pin
// color-scheme. Leaving the attribute off lets the OS preference win, which is
// already what the stylesheet paints before React mounts.
export function useTheme(preference: ThemePreference): void {
  useEffect(() => {
    const root = document.documentElement

    if (preference === 'system') {
      delete root.dataset.theme
    } else {
      root.dataset.theme = preference
    }
  }, [preference])
}
