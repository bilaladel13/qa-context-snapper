import { generatePlaywrightScript } from '@/generator'
import { buildDescription } from '@/jira/adf'
import { createIssue, listAssignableUsers, listProjects, verifyCredentials } from '@/jira/api'
import { clearCredentials, normalizeDomain, readCredentials, writeCredentials } from '@/jira/store'
import type { JiraConnection } from '@/jira/types'
import { fail, ok } from '@/messaging/protocol'
import type { JiraRequest, Result } from '@/messaging/protocol'
import { loadSettings } from '@/settings/store'
import { getState } from './store'

const ACCOUNT_NAME_KEY = 'jiraAccountName'

async function rememberAccountName(name: string | null): Promise<void> {
  await chrome.storage.local.set({ [ACCOUNT_NAME_KEY]: name })
}

async function recallAccountName(): Promise<string | null> {
  const stored = await chrome.storage.local.get(ACCOUNT_NAME_KEY)
  return (stored[ACCOUNT_NAME_KEY] as string | null) ?? null
}

async function getConnection(): Promise<Result<{ connection: JiraConnection | null }>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return ok({ connection: null })
  }

  return ok({
    connection: {
      domain: credentials.domain,
      email: credentials.email,
      accountName: await recallAccountName(),
      hasToken: true,
    },
  })
}

async function connect(request: {
  domain: string
  email: string
  token: string
}): Promise<Result<unknown>> {
  const domain = normalizeDomain(request.domain)

  if (!domain) {
    return fail('Enter a Jira site address, for example acme.atlassian.net.')
  }

  const email = request.email.trim()
  const token = request.token.trim()

  if (!email.includes('@')) {
    return fail('Enter the email address of the Atlassian account.')
  }

  if (!token) {
    return fail('Enter an API token.')
  }

  const credentials = { domain, email, token }
  const verified = await verifyCredentials(credentials)

  if (!verified.ok) {
    return verified
  }

  const projects = await listProjects(credentials)

  if (!projects.ok) {
    return projects
  }

  // Only persisted once Jira has confirmed the credentials work.
  await writeCredentials(credentials)
  await rememberAccountName(verified.data.accountName)

  return ok({
    connection: {
      domain,
      email,
      accountName: verified.data.accountName,
      hasToken: true,
    },
    projects: projects.data,
  })
}

async function disconnect(): Promise<Result<unknown>> {
  await clearCredentials()
  await chrome.storage.local.remove(ACCOUNT_NAME_KEY)

  return ok({ disconnected: true })
}

async function projects(): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Jira account first.')
  }

  const response = await listProjects(credentials)

  return response.ok ? ok({ projects: response.data }) : response
}

async function assignees(projectKey: string): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Jira account first.')
  }

  if (!projectKey) {
    return ok({ users: [] })
  }

  const response = await listAssignableUsers(credentials, projectKey)

  return response.ok ? ok({ users: response.data }) : response
}

async function create(request: JiraRequest & { type: 'JIRA_CREATE_ISSUE' }): Promise<Result<unknown>> {
  const credentials = await readCredentials()

  if (!credentials) {
    return fail('Connect a Jira account first.')
  }

  const { draft } = request
  const summary = draft.summary.trim()

  if (!summary) {
    return fail('Enter a summary for the ticket.')
  }

  if (!draft.projectKey || !draft.issueTypeId) {
    return fail('Choose a project and an issue type.')
  }

  const state = await getState()

  if (!state.snapshot) {
    return fail('There is no recording to attach. Record a session first.')
  }

  const settings = await loadSettings()
  const script = settings.jira.includePlaywrightScript
    ? generatePlaywrightScript(state.snapshot, settings.playwright)
    : null

  return createIssue(credentials, {
    projectKey: draft.projectKey,
    issueTypeId: draft.issueTypeId,
    assigneeAccountId: draft.assigneeAccountId,
    summary,
    description: buildDescription(state.snapshot, {
      playwrightScript: script,
      includeConsoleErrors: settings.jira.includeConsoleErrors,
      actual: draft.actual,
      expected: draft.expected,
    }),
  })
}

export function handleJiraRequest(request: JiraRequest): Promise<Result<unknown>> {
  switch (request.type) {
    case 'JIRA_GET_CONNECTION':
      return getConnection()
    case 'JIRA_CONNECT':
      return connect(request)
    case 'JIRA_DISCONNECT':
      return disconnect()
    case 'JIRA_LIST_PROJECTS':
      return projects()
    case 'JIRA_LIST_ASSIGNEES':
      return assignees(request.projectKey)
    case 'JIRA_CREATE_ISSUE':
      return create(request)
  }
}
