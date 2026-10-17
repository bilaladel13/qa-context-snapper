import {
  cleanAndDeduplicateInteractions,
  describeStep,
  formatExpectedAssertion,
  formatQaseCaseUrl,
} from '@/generator/shared'

export { formatQaseCaseUrl }
import { fail, ok } from '@/messaging/protocol'
import type { Result } from '@/messaging/protocol'
import type { ContextSnapshot } from '@/types'
import type {
  QaseCase,
  QaseCreateCasePayload,
  QaseCredentials,
  QaseProject,
  QaseRun,
  QaseRunStatus,
  QaseStep,
  QaseSubmitResultPayload,
  QaseSuite,
  QaseUpdateCasePayload,
} from './types'

const QASE_API_BASE = 'https://api.qase.io/v1'
const REQUEST_TIMEOUT_MS = 20_000

function describeFailure(status: number, body: unknown): string {
  if (status === 401) {
    return 'Qase rejected the API token. Please verify your token.'
  }
  if (status === 403) {
    return 'Qase refused the request. Verify project code and permissions.'
  }
  if (status === 404) {
    return 'Qase returned 404. Check your project code.'
  }

  const payload = body as { errorMessage?: string; error?: string } | null
  const message = payload?.errorMessage || payload?.error
  return message ? String(message) : `Qase API returned HTTP ${status}.`
}

async function request<T>(
  credentials: QaseCredentials,
  path: string,
  init: RequestInit = {},
): Promise<Result<T>> {
  let response: Response

  try {
    response = await fetch(`${QASE_API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Token: credentials.apiToken,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return fail('Qase API did not respond in time.')
    }
    return fail('Could not reach Qase API. Check your network connection.')
  }

  const raw = await response.text()
  let parsed: unknown = null

  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    return fail(describeFailure(response.status, parsed))
  }

  const responseBody = parsed as { status?: boolean; result?: T; errorMessage?: string } | null
  if (responseBody && responseBody.status === false) {
    return fail(responseBody.errorMessage || 'Qase API returned failure.')
  }

  return ok((responseBody?.result ?? parsed) as T)
}

export async function verifyProject(
  credentials: QaseCredentials,
): Promise<Result<{ title: string; code: string }>> {
  const response = await request<{ title: string; code: string }>(
    credentials,
    `/project/${credentials.projectCode}`,
  )
  return response
}

export async function listProjects(
  credentials: { apiToken: string },
): Promise<Result<QaseProject[]>> {
  const response = await request<{
    total: number
    count: number
    entities: Array<{
      code: string
      title: string
    }>
  }>({ apiToken: credentials.apiToken, projectCode: '' }, '/project?limit=100')

  if (!response.ok) {
    return response
  }

  const projects: QaseProject[] = (response.data.entities || []).map((entity) => ({
    code: entity.code,
    title: entity.title,
  }))

  return ok(projects)
}

export async function listSuites(
  credentials: QaseCredentials,
): Promise<Result<QaseSuite[]>> {
  const response = await request<{
    total: number
    count: number
    entities: Array<{
      id: number
      title: string
      description?: string | null
      parent_id?: number | null
    }>
  }>(credentials, `/suite/${credentials.projectCode}?limit=100`)

  if (!response.ok) {
    return response
  }

  const suites: QaseSuite[] = (response.data.entities || []).map((entity) => ({
    id: entity.id,
    title: entity.title,
    description: entity.description,
    parent_id: entity.parent_id,
  }))

  return ok(suites)
}

export function formatSuiteTitle(suite: QaseSuite, allSuites: QaseSuite[]): string {
  const parts: string[] = [suite.title]
  const visited = new Set<number>([suite.id])
  let currentParentId = suite.parent_id

  while (currentParentId != null) {
    if (visited.has(currentParentId)) break
    visited.add(currentParentId)
    const parent = allSuites.find((s) => s.id === currentParentId)
    if (!parent) break
    parts.unshift(parent.title)
    currentParentId = parent.parent_id
  }

  return parts.join(' > ')
}

export async function listCases(
  credentials: QaseCredentials,
): Promise<Result<QaseCase[]>> {
  const response = await request<{
    total: number
    count: number
    entities: Array<{
      id: number
      title: string
      suite_id?: number | null
      preconditions?: string | null
      steps?: QaseStep[]
    }>
  }>(credentials, `/case/${credentials.projectCode}?limit=100`)

  if (!response.ok) {
    return response
  }

  const cases: QaseCase[] = (response.data.entities || []).map((entity) => ({
    id: entity.id,
    title: entity.title,
    suite_id: entity.suite_id,
    preconditions: entity.preconditions,
    steps: entity.steps,
  }))

  return ok(cases)
}

export async function createCase(
  credentials: QaseCredentials,
  payload: QaseCreateCasePayload,
): Promise<Result<{ id: number }>> {
  return request<{ id: number }>(credentials, `/case/${credentials.projectCode}`, {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      suite_id: payload.suite_id ?? undefined,
      preconditions: payload.preconditions,
      steps_type: payload.steps_type ?? 'classic',
      steps: payload.steps ?? [],
      severity: payload.severity,
      priority: payload.priority,
    }),
  })
}

export async function updateCaseSteps(
  credentials: QaseCredentials,
  caseId: number,
  payload: QaseUpdateCasePayload,
): Promise<Result<{ id: number }>> {
  return request<{ id: number }>(credentials, `/case/${credentials.projectCode}/${caseId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.suite_id ? { suite_id: payload.suite_id } : {}),
      preconditions: payload.preconditions,
      steps_type: payload.steps_type ?? 'classic',
      steps: payload.steps ?? [],
    }),
  })
}

export async function deleteCase(
  credentials: QaseCredentials,
  caseId: number,
): Promise<Result<{ id: number }>> {
  return request<{ id: number }>(credentials, `/case/${credentials.projectCode}/${caseId}`, {
    method: 'DELETE',
  })
}

export async function ensureActiveRun(
  credentials: QaseCredentials,
  runTitle = 'Sprint 1 - Staging Verification',
  caseIds: number[] = [],
): Promise<Result<QaseRun>> {
  // Check for existing active runs first
  const activeRunsResponse = await request<{
    total: number
    count: number
    entities: Array<{ id: number; title: string; status: number; status_text?: string }>
  }>(credentials, `/run/${credentials.projectCode}?status=active&limit=10`)

  if (activeRunsResponse.ok && activeRunsResponse.data.entities?.length > 0) {
    const existing = activeRunsResponse.data.entities[0]!
    return ok({
      id: existing.id,
      title: existing.title,
      status: existing.status,
      status_text: existing.status_text,
    })
  }

  // Create a new run if none exists
  const createResponse = await request<{ id: number }>(
    credentials,
    `/run/${credentials.projectCode}`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: runTitle,
        cases: caseIds.length > 0 ? caseIds : undefined,
      }),
    },
  )

  if (!createResponse.ok) {
    return createResponse
  }

  return ok({
    id: createResponse.data.id,
    title: runTitle,
    status: 0,
    status_text: 'active',
  })
}

export async function submitRunResult(
  credentials: QaseCredentials,
  runId: number,
  payload: QaseSubmitResultPayload,
): Promise<Result<{ case_id: number; hash: string }>> {
  return request<{ case_id: number; hash: string }>(
    credentials,
    `/result/${credentials.projectCode}/${runId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        case_id: payload.case_id,
        status: payload.status,
        time_ms: payload.time_ms ?? 1000,
        comment: payload.comment,
        defect: payload.defect ?? payload.status === 'failed',
      }),
    },
  )
}

export async function attachExternalIssue(
  credentials: QaseCredentials,
  caseId: number,
  jiraIssueKey: string,
): Promise<Result<unknown>> {
  try {
    return await request(credentials, `/case/${credentials.projectCode}/external-issue/attach`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'jira-cloud',
        links: [
          {
            case_id: caseId,
            external_issues: [jiraIssueKey],
          },
        ],
      }),
    })
  } catch {
    // Non-blocking if Jira integration is not configured in Qase
    return ok({ attached: false, reason: 'skipped' })
  }
}

export function formatPreconditions(snapshot: ContextSnapshot): string {
  const env = snapshot.environment
  const title = env.pageTitle ? ` (${env.pageTitle})` : ''
  return `Target Page: ${env.pageUrl}${title}\nEnvironment: ${env.browser} ${env.browserVersion} on ${env.os}\nViewport: ${env.viewportSize}`
}

export function mapSnapshotToSteps(snapshot: ContextSnapshot): QaseStep[] {
  if (!snapshot.interactions || snapshot.interactions.length === 0) {
    return [
      {
        action: `Open ${snapshot.environment.pageUrl}`,
        data: snapshot.environment.pageUrl,
        expected_result: 'Page loads successfully',
      },
    ]
  }

  const cleaned = cleanAndDeduplicateInteractions(snapshot.interactions)
  const steps: QaseStep[] = []

  for (let i = 0; i < cleaned.length; i++) {
    const step = cleaned[i]
    if (!step) continue

    // If step is an assertion, attach it as the expected_result of the preceding action
    if (step.type === 'assertion') {
      const expectation =
        step.customExpected ||
        step.assertion?.message ||
        formatExpectedAssertion(step)

      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1]
        const isDefaultResult =
          !lastStep.expected_result ||
          lastStep.expected_result === 'Target element is triggered and UI updates accordingly' ||
          lastStep.expected_result === 'Value is entered into the target field' ||
          lastStep.expected_result === 'Target URL loads successfully'

        if (isDefaultResult) {
          lastStep.expected_result = expectation
        } else {
          lastStep.expected_result = `${lastStep.expected_result}\n- ${expectation}`
        }
      } else {
        steps.push({
          action: step.customAction || describeStep(step),
          data: null,
          expected_result: expectation,
        })
      }
      continue
    }

    const action = step.customAction || describeStep(step)
    let data: string | null = null
    if (step.masked) {
      data = '[MASKED SECRET]'
    } else if (step.value) {
      data = step.value
    } else if (step.key) {
      data = `Key: ${step.key}`
    } else if (step.target?.tagName) {
      data = `${step.target.tagName}: ${step.target.cssSelector}`
    }

    let defaultExpected: string | null = step.customExpected ?? null
    if (!defaultExpected) {
      if (step.type === 'navigation') {
        defaultExpected = 'Target URL loads successfully'
      } else if (step.type === 'input') {
        defaultExpected = 'Value is entered into the target field'
      } else if (step.type === 'click') {
        defaultExpected = 'Target element is triggered and UI updates accordingly'
      } else {
        defaultExpected = 'Action completes with expected UI response'
      }
    }

    steps.push({
      action,
      data,
      expected_result: defaultExpected,
    })
  }

  if (steps.length > 0) {
    const last = steps[steps.length - 1]
    if (last.expected_result === 'Target element is triggered and UI updates accordingly') {
      last.expected_result = 'Flow completes with expected UI response and no unhandled errors.'
    }
  }

  return steps.length > 0 ? steps : [
    {
      action: `Open ${snapshot.environment.pageUrl}`,
      data: snapshot.environment.pageUrl,
      expected_result: 'Page loads successfully',
    },
  ]
}

export function detectRunStatus(snapshot: ContextSnapshot): QaseRunStatus {
  const hasViolation = snapshot.interactions.some(
    (i) => i.type === 'assertion' && i.assertion?.isViolation,
  )
  const hasErrors = (snapshot.consoleErrors?.length ?? 0) > 0
  const hasNetworkFailure = (snapshot.network ?? []).some((n) => n.outcome !== 'success')

  return hasViolation || hasErrors || hasNetworkFailure ? 'failed' : 'passed'
}
