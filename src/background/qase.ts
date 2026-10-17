import {
  createCase,
  deleteCase,
  detectRunStatus,
  ensureActiveRun,
  formatPreconditions,
  listCases,
  listProjects,
  listSuites,
  mapSnapshotToSteps,
  submitRunResult,
  updateCaseSteps,
  verifyProject,
} from '@/qase/api'
import {
  clearCredentials,
  normalizeProjectCode,
  readCredentials,
  writeCredentials,
} from '@/qase/store'
import type { QaseConnection, QaseSyncResult } from '@/qase/types'
import { fail, ok } from '@/messaging/protocol'
import type { QaseRequest, Result } from '@/messaging/protocol'
import { getState, updateState } from './store'

const PROJECT_TITLE_KEY = 'qaseProjectTitle'

async function rememberProjectTitle(title: string | null): Promise<void> {
  await chrome.storage.local.set({ [PROJECT_TITLE_KEY]: title })
}

async function recallProjectTitle(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PROJECT_TITLE_KEY)
  return (stored[PROJECT_TITLE_KEY] as string | null) ?? null
}

async function getConnection(): Promise<Result<{ connection: QaseConnection | null }>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return ok({ connection: null })
  }

  return ok({
    connection: {
      projectCode: credentials.projectCode,
      projectTitle: await recallProjectTitle(),
      hasToken: Boolean(credentials.apiToken),
    },
  })
}

async function connect(request: {
  projectCode: string
  apiToken: string
}): Promise<Result<unknown>> {
  const projectCode = normalizeProjectCode(request.projectCode)
  const apiToken = request.apiToken.trim()

  if (!projectCode) {
    return fail('Enter a Qase project code, for example SQA.')
  }

  if (!apiToken) {
    return fail('Enter a Qase API token.')
  }

  const credentials = { projectCode, apiToken }
  const verified = await verifyProject(credentials)

  if (!verified.ok) {
    return verified
  }

  const [cases, suitesRes] = await Promise.all([
    listCases(credentials),
    listSuites(credentials),
  ])

  if (!cases.ok) {
    return cases
  }

  await writeCredentials(credentials)
  await rememberProjectTitle(verified.data.title)

  return ok({
    connection: {
      projectCode,
      projectTitle: verified.data.title,
      hasToken: true,
    },
    cases: cases.data,
    suites: suitesRes.ok ? suitesRes.data : [],
  })
}

async function disconnect(): Promise<Result<unknown>> {
  await clearCredentials()
  await chrome.storage.local.remove(PROJECT_TITLE_KEY)

  return ok({ disconnected: true })
}

async function projects(): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Qase workspace first.')
  }

  const response = await listProjects(credentials)
  return response.ok ? ok({ projects: response.data }) : response
}

async function cases(projectCode?: string): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Qase workspace first.')
  }

  const creds = projectCode ? { ...credentials, projectCode } : credentials
  const response = await listCases(creds)
  return response.ok ? ok({ cases: response.data }) : response
}

async function suites(projectCode?: string): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Qase workspace first.')
  }

  const creds = projectCode ? { ...credentials, projectCode } : credentials
  const response = await listSuites(creds)
  return response.ok ? ok({ suites: response.data }) : response
}

async function deleteCaseHandler(
  request: QaseRequest & { type: 'QASE_DELETE_CASE' },
): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Qase workspace first.')
  }

  const creds = request.projectCode ? { ...credentials, projectCode: request.projectCode } : credentials
  const response = await deleteCase(creds, request.caseId)
  return response.ok ? ok({ id: response.data.id }) : response
}

async function sync(
  request: QaseRequest & { type: 'QASE_SYNC' },
): Promise<Result<QaseSyncResult>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Qase workspace first.')
  }

  const state = await getState()

  if (!state.snapshot) {
    return fail('There is no recording to sync. Record a session first.')
  }

  const { snapshot } = state
  const { draft } = request
  const preconditions = formatPreconditions(snapshot)
  const steps = mapSnapshotToSteps(snapshot)

  let targetCaseId: number
  let targetCaseTitle: string

  if (draft.mode === 'create') {
    const title = (draft.title || snapshot.environment.pageTitle || 'Recorded Flow').trim()
    if (!title) {
      return fail('Enter a test case title.')
    }

    const created = await createCase(credentials, {
      title,
      suite_id: draft.suiteId,
      preconditions,
      steps_type: 'classic',
      steps,
    })

    if (!created.ok) {
      return created
    }

    targetCaseId = created.data.id
    targetCaseTitle = title
  } else {
    if (!draft.caseId) {
      return fail('Select an existing test case.')
    }

    targetCaseId = draft.caseId
    targetCaseTitle = draft.title || `Case ${targetCaseId}`

    if (draft.updateSteps || draft.suiteId) {
      const updated = await updateCaseSteps(credentials, targetCaseId, {
        ...(draft.suiteId ? { suite_id: draft.suiteId } : {}),
        preconditions,
        steps_type: 'classic',
        steps,
      })

      if (!updated.ok) {
        return updated
      }
    }
  }

  // Ensure active test run
  const run = await ensureActiveRun(credentials, 'Sprint 1 - Staging Verification', [targetCaseId])
  if (!run.ok) {
    return run
  }

  // Submit test run result
  const durationMs = Math.max(1000, snapshot.stoppedAt - snapshot.startedAt)
  const status = draft.status || detectRunStatus(snapshot)
  const comment = (draft.comment || `Synced from QA Context Snapper session ${snapshot.sessionId}`).trim()

  const resultSubmitted = await submitRunResult(credentials, run.data.id, {
    case_id: targetCaseId,
    status,
    time_ms: durationMs,
    comment,
    defect: status === 'failed',
  })

  if (!resultSubmitted.ok) {
    return resultSubmitted
  }

  // Cross-link: store the active Qase Case Code (e.g. "SQA-3") in session state
  const caseCode = `${credentials.projectCode}-${targetCaseId}`
  await updateState({ qaseCaseCode: caseCode })

  return ok({
    caseId: targetCaseId,
    caseCode,
    caseTitle: targetCaseTitle,
    runId: run.data.id,
    runTitle: run.data.title,
    status,
  })
}

export function handleQaseRequest(request: QaseRequest): Promise<Result<unknown>> {
  switch (request.type) {
    case 'QASE_GET_CONNECTION':
      return getConnection()
    case 'QASE_CONNECT':
      return connect(request)
    case 'QASE_DISCONNECT':
      return disconnect()
    case 'QASE_LIST_PROJECTS':
      return projects()
    case 'QASE_LIST_CASES':
      return cases(request.projectCode)
    case 'QASE_LIST_SUITES':
      return suites(request.projectCode)
    case 'QASE_DELETE_CASE':
      return deleteCaseHandler(request)
    case 'QASE_SYNC':
      return sync(request)
  }
}
