import type { JiraCredentials } from './types'

// Kept in a key of its own rather than inside settings, so the token is never
// swept up by anything that reads, exports or logs the settings object.
//
// chrome.storage.local is sandboxed to this extension: other extensions and
// page scripts cannot read it. It is not encrypted at rest, which no extension
// storage is, so the token is treated as a revocable credential and is never
// returned to the popup once saved.
const CREDENTIALS_KEY = 'jiraCredentials'

export async function readCredentials(): Promise<JiraCredentials | null> {
  try {
    const stored = await chrome.storage.local.get(CREDENTIALS_KEY)
    const value = stored[CREDENTIALS_KEY] as JiraCredentials | undefined

    return value?.domain && value.email && value.token ? value : null
  } catch {
    return null
  }
}

export async function writeCredentials(credentials: JiraCredentials): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials })
}

export async function clearCredentials(): Promise<void> {
  await chrome.storage.local.remove(CREDENTIALS_KEY)
}

// Accepts "acme", "acme.atlassian.net", or a full URL with or without a path.
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')

  if (!trimmed) {
    return null
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)

    if (!url.hostname) {
      return null
    }

    return url.hostname.includes('.')
      ? `https://${url.hostname}`
      : `https://${url.hostname}.atlassian.net`
  } catch {
    return null
  }
}
