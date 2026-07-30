import { useEffect, useState } from 'react'
import { queryBackground } from '@/messaging/client'
import type { ActiveTabInfo } from '@/messaging/protocol'
import { composeEnvironment, detectClient } from '@/shared/environment'
import type { EnvironmentSnapshot } from '@/types'

export interface EnvironmentState {
  environment: EnvironmentSnapshot | null
  tab: ActiveTabInfo | null
  loading: boolean
}

// The popup runs in the same browser as the page, so browser, OS, screen and
// language need no tab access at all. Only the page fields do, which is why a
// blocked page still shows most of the table.
export function useEnvironment(): EnvironmentState {
  const [environment, setEnvironment] = useState<EnvironmentSnapshot | null>(null)
  const [tab, setTab] = useState<ActiveTabInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const read = async () => {
      const [client, tabResult] = await Promise.all([
        detectClient(),
        queryBackground({ type: 'GET_ACTIVE_TAB' }),
      ])

      if (!active) {
        return
      }

      const page = tabResult.ok
        ? tabResult.data
        : { pageUrl: 'unavailable', pageTitle: '', viewportSize: 'unavailable' }

      setEnvironment(composeEnvironment(client, page))
      setTab(tabResult.ok ? tabResult.data : null)
      setLoading(false)
    }

    void read()

    return () => {
      active = false
    }
  }, [])

  return { environment, tab, loading }
}
