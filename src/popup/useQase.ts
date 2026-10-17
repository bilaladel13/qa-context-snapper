import { useCallback, useEffect, useRef, useState } from 'react'
import { callQase } from '@/messaging/client'
import type {
  QaseCase,
  QaseConnection,
  QaseProject,
  QaseSuite,
  QaseSyncDraft,
  QaseSyncResult,
} from '@/qase/types'

export interface QaseController {
  connection: QaseConnection | null
  projects: QaseProject[]
  cases: QaseCase[]
  suites: QaseSuite[]
  loading: boolean
  busy: boolean
  error: string | null
  synced: QaseSyncResult | null
  connect: (projectCode: string, apiToken: string) => Promise<boolean>
  disconnect: () => Promise<void>
  refreshProjects: () => Promise<void>
  refreshCases: (projectCode?: string) => Promise<void>
  refreshSuites: (projectCode?: string) => Promise<void>
  sync: (draft: QaseSyncDraft) => Promise<boolean>
  dismissError: () => void
  clearSynced: () => void
}

export function useQase(): QaseController {
  const [connection, setConnection] = useState<QaseConnection | null>(null)
  const [projects, setProjects] = useState<QaseProject[]>([])
  const [cases, setCases] = useState<QaseCase[]>([])
  const [suites, setSuites] = useState<QaseSuite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState<QaseSyncResult | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    const response = await callQase({ type: 'QASE_LIST_PROJECTS' })

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setProjects(response.data.projects)
    } else {
      setError(response.error)
    }
  }, [])

  const refreshCases = useCallback(async (projectCode?: string) => {
    const response = await callQase({ type: 'QASE_LIST_CASES', projectCode })

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setCases(response.data.cases)
    } else {
      setError(response.error)
    }
  }, [])

  const refreshSuites = useCallback(async (projectCode?: string) => {
    const response = await callQase({ type: 'QASE_LIST_SUITES', projectCode })

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setSuites(response.data.suites)
    } else {
      setError(response.error)
    }
  }, [])

  useEffect(() => {
    let active = true

    void callQase({ type: 'QASE_GET_CONNECTION' }).then(async (response) => {
      if (!active) {
        return
      }

      if (response.ok && response.data.connection) {
        setConnection(response.data.connection)
        await Promise.all([refreshProjects(), refreshCases(), refreshSuites()])
      }

      if (active) {
        setLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [refreshProjects, refreshCases, refreshSuites])

  const connect = useCallback(async (projectCode: string, apiToken: string) => {
    setBusy(true)
    setError(null)

    const response = await callQase({ type: 'QASE_CONNECT', projectCode, apiToken })

    if (!mounted.current) {
      return response.ok
    }

    if (response.ok) {
      setConnection(response.data.connection)
      setCases(response.data.cases)
      setSuites(response.data.suites)
    } else {
      setError(response.error)
    }

    setBusy(false)
    return response.ok
  }, [])

  const disconnect = useCallback(async () => {
    setBusy(true)
    setError(null)

    const response = await callQase({ type: 'QASE_DISCONNECT' })

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setConnection(null)
      setCases([])
      setSuites([])
      setSynced(null)
    } else {
      setError(response.error)
    }

    setBusy(false)
  }, [])

  const sync = useCallback(async (draft: QaseSyncDraft) => {
    setBusy(true)
    setError(null)

    const response = await callQase({ type: 'QASE_SYNC', draft })

    if (!mounted.current) {
      return response.ok
    }

    if (response.ok) {
      setSynced(response.data)
      void refreshCases()
    } else {
      setError(response.error)
    }

    setBusy(false)
    return response.ok
  }, [refreshCases])

  const dismissError = useCallback(() => setError(null), [])
  const clearSynced = useCallback(() => setSynced(null), [])

  return {
    connection,
    projects,
    cases,
    suites,
    loading,
    busy,
    error,
    synced,
    connect,
    disconnect,
    refreshProjects,
    refreshCases,
    refreshSuites,
    sync,
    dismissError,
    clearSynced,
  }
}
