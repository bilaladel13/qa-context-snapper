import type { QaseCredentials } from './types'

const CREDENTIALS_KEY = 'qaseCredentials'

const defaultToken =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_QASE_TOKEN) ||
  (typeof process !== 'undefined' && process.env?.VITE_DEFAULT_QASE_TOKEN) ||
  ''

const defaultProject =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_QASE_PROJECT) ||
  (typeof process !== 'undefined' && process.env?.VITE_DEFAULT_QASE_PROJECT) ||
  'SQA'

export const DEFAULT_QASE_CREDENTIALS: QaseCredentials = {
  apiToken: defaultToken,
  projectCode: defaultProject,
}

export async function readCredentials(): Promise<QaseCredentials | null> {
  try {
    const stored = await chrome.storage.local.get(CREDENTIALS_KEY)
    const value = stored[CREDENTIALS_KEY] as QaseCredentials | undefined

    if (value?.apiToken && value?.projectCode) {
      return value
    }

    // Default to the generated token and project code if none explicitly stored
    return DEFAULT_QASE_CREDENTIALS
  } catch {
    return DEFAULT_QASE_CREDENTIALS
  }
}

export const readQaseCredentials = readCredentials

export async function writeCredentials(credentials: QaseCredentials): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials })
}

export async function clearCredentials(): Promise<void> {
  await chrome.storage.local.remove(CREDENTIALS_KEY)
}

export function normalizeProjectCode(input: string): string {
  return input.trim().toUpperCase()
}
