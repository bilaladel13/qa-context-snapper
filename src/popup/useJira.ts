import { useCallback, useEffect, useRef, useState } from 'react'
import { callJira } from '@/messaging/client'
import type {
  JiraConnection,
  JiraCreatedIssue,
  JiraDraft,
  JiraProject,
  JiraUser,
} from '@/jira/types'

export interface JiraController {
  connection: JiraConnection | null
  projects: JiraProject[]
  assignees: JiraUser[]
  loadingAssignees: boolean
  loading: boolean
  busy: boolean
  error: string | null
  created: JiraCreatedIssue | null
  connect: (domain: string, email: string, token: string) => Promise<boolean>
  disconnect: () => Promise<void>
  refreshProjects: () => Promise<void>
  loadAssignees: (projectKey: string) => void
  createIssue: (draft: JiraDraft) => Promise<boolean>
  dismissError: () => void
  clearCreated: () => void
}

export function useJira(): JiraController {
  const [connection, setConnection] = useState<JiraConnection | null>(null)
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [assignees, setAssignees] = useState<JiraUser[]>([])
  const [loadingAssignees, setLoadingAssignees] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<JiraCreatedIssue | null>(null)
  const mounted = useRef(true)
  const assigneeRequest = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadProjects = useCallback(async () => {
    const response = await callJira({ type: 'JIRA_LIST_PROJECTS' })

    if (!mounted.current) {
      return
    }

    if (response.ok) {
      setProjects(response.data.projects)
    } else {
      setError(response.error)
    }
  }, [])

  useEffect(() => {
    let active = true

    void callJira({ type: 'JIRA_GET_CONNECTION' }).then(async (response) => {
      if (!active) {
        return
      }

      if (response.ok && response.data.connection) {
        setConnection(response.data.connection)
        await loadProjects()
      }

      if (active) {
        setLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [loadProjects])

  const connect = useCallback(async (domain: string, email: string, token: string) => {
    setBusy(true)
    setError(null)

    const response = await callJira({ type: 'JIRA_CONNECT', domain, email, token })

    if (!mounted.current) {
      return response.ok
    }

    if (response.ok) {
      setConnection(response.data.connection)
      setProjects(response.data.projects)
    } else {
      setError(response.error)
    }

    setBusy(false)
    return response.ok
  }, [])

  const disconnect = useCallback(async () => {
    setBusy(true)
    await callJira({ type: 'JIRA_DISCONNECT' })

    if (mounted.current) {
      setConnection(null)
      setProjects([])
      setCreated(null)
      setError(null)
      setBusy(false)
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    setBusy(true)
    await loadProjects()

    if (mounted.current) {
      setBusy(false)
    }
  }, [loadProjects])

  // Switching projects quickly can land responses out of order, so only the
  // newest request is allowed to write.
  const loadAssignees = useCallback((projectKey: string) => {
    const requestId = assigneeRequest.current + 1
    assigneeRequest.current = requestId

    if (!projectKey) {
      setAssignees([])
      setLoadingAssignees(false)
      return
    }

    setLoadingAssignees(true)

    void callJira({ type: 'JIRA_LIST_ASSIGNEES', projectKey }).then((response) => {
      if (!mounted.current || assigneeRequest.current !== requestId) {
        return
      }

      setAssignees(response.ok ? response.data.users : [])
      setLoadingAssignees(false)
    })
  }, [])

  const createIssue = useCallback(async (draft: JiraDraft) => {
    setBusy(true)
    setError(null)

    const response = await callJira({ type: 'JIRA_CREATE_ISSUE', draft })

    if (!mounted.current) {
      return response.ok
    }

    if (response.ok) {
      setCreated(response.data)
    } else {
      setError(response.error)
    }

    setBusy(false)
    return response.ok
  }, [])

  return {
    connection,
    projects,
    assignees,
    loadingAssignees,
    loading,
    busy,
    error,
    created,
    connect,
    disconnect,
    refreshProjects,
    loadAssignees,
    createIssue,
    dismissError: useCallback(() => setError(null), []),
    clearCreated: useCallback(() => setCreated(null), []),
  }
}
