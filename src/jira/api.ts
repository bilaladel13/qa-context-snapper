import { fail, ok } from '@/messaging/protocol'
import type { Result } from '@/messaging/protocol'
import type { AdfDocument } from './adf'
import type { JiraCreatedIssue, JiraCredentials, JiraProject } from './types'

const REQUEST_TIMEOUT_MS = 20_000
const PROJECT_PAGE_SIZE = 100

function basicAuth(email: string, token: string): string {
  const bytes = new TextEncoder().encode(`${email}:${token}`)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

// Jira reports failures in errorMessages, per field errors, or neither.
function describeFailure(status: number, body: unknown): string {
  if (status === 401) {
    return 'Jira rejected the credentials. Check the email and regenerate the API token if needed.'
  }

  if (status === 403) {
    return 'Jira accepted the credentials but refused the request. The account may lack permission for this project.'
  }

  if (status === 404) {
    return 'Jira returned 404. Check the site domain.'
  }

  const payload = body as { errorMessages?: string[]; errors?: Record<string, string> } | null
  const messages = [
    ...(payload?.errorMessages ?? []),
    ...Object.entries(payload?.errors ?? {}).map(([field, message]) => `${field}: ${message}`),
  ]

  return messages.length > 0 ? messages.join(' ') : `Jira returned HTTP ${status}.`
}

async function request<T>(
  credentials: JiraCredentials,
  path: string,
  init: RequestInit = {},
): Promise<Result<T>> {
  let response: Response

  try {
    response = await fetch(`${credentials.domain}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${basicAuth(credentials.email, credentials.token)}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return fail('Jira did not respond in time.')
    }

    return fail('Could not reach Jira. Check the site domain and your network connection.')
  }

  const raw = await response.text()
  let parsed: unknown = null

  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    // An HTML body means the domain resolved to something that is not the API.
    if (parsed === null && raw.trimStart().startsWith('<')) {
      return fail('That domain did not return a Jira API response. Check the site address.')
    }

    return fail(describeFailure(response.status, parsed))
  }

  return ok(parsed as T)
}

export async function verifyCredentials(
  credentials: JiraCredentials,
): Promise<Result<{ accountName: string | null }>> {
  const response = await request<{ displayName?: string }>(credentials, '/rest/api/3/myself')

  return response.ok ? ok({ accountName: response.data.displayName ?? null }) : response
}

interface ProjectSearchResponse {
  values?: {
    id: string
    key: string
    name: string
    issueTypes?: { id: string; name: string; subtask?: boolean }[]
  }[]
  isLast?: boolean
}

// Expanding issueTypes here avoids a second round trip per project, and issue
// type ids differ per project on team managed sites.
export async function listProjects(
  credentials: JiraCredentials,
): Promise<Result<JiraProject[]>> {
  const projects: JiraProject[] = []
  let startAt = 0

  for (let page = 0; page < 10; page += 1) {
    const response = await request<ProjectSearchResponse>(
      credentials,
      `/rest/api/3/project/search?startAt=${startAt}&maxResults=${PROJECT_PAGE_SIZE}&orderBy=name&expand=issueTypes`,
    )

    if (!response.ok) {
      return response
    }

    const values = response.data.values ?? []

    for (const value of values) {
      projects.push({
        id: value.id,
        key: value.key,
        name: value.name,
        issueTypes: (value.issueTypes ?? [])
          .filter((issueType) => !issueType.subtask)
          .map((issueType) => ({
            id: issueType.id,
            name: issueType.name,
            subtask: Boolean(issueType.subtask),
          })),
      })
    }

    if (response.data.isLast !== false || values.length === 0) {
      break
    }

    startAt += values.length
  }

  return projects.length > 0
    ? ok(projects)
    : fail('No Jira projects are visible to this account.')
}

export async function createIssue(
  credentials: JiraCredentials,
  input: { projectKey: string; issueTypeId: string; summary: string; description: AdfDocument },
): Promise<Result<JiraCreatedIssue>> {
  const response = await request<{ key?: string }>(credentials, '/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        project: { key: input.projectKey },
        issuetype: { id: input.issueTypeId },
        summary: input.summary,
        description: input.description,
      },
    }),
  })

  if (!response.ok) {
    return response
  }

  const key = response.data.key

  return key
    ? ok({ key, url: `${credentials.domain}/browse/${key}` })
    : fail('Jira created the issue but did not return its key.')
}
