import { sendToTab } from '@/messaging/client'
import { fail, ok } from '@/messaging/protocol'
import type { Result } from '@/messaging/protocol'
import { CONSOLE_CHANNEL } from '@/content/bridge-protocol'
import { installConsoleBridge } from '@/content/main-world-bridge'

const BLOCKED_PROTOCOLS = ['chrome:', 'chrome-untrusted:', 'devtools:', 'edge:', 'about:', 'view-source:']
const BLOCKED_HOSTS = ['chrome.google.com', 'chromewebstore.google.com']

// Returns null when the page can be recorded, otherwise the reason to show.
export function blockedReason(url: string | undefined): string | null {
  if (!url) {
    return 'This tab has no address yet.'
  }

  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return 'This tab has an address the extension cannot read.'
  }

  if (parsed.protocol === 'chrome-extension:') {
    return 'Extension pages cannot be recorded.'
  }

  if (BLOCKED_HOSTS.includes(parsed.hostname)) {
    return 'The Chrome Web Store blocks extensions from running.'
  }

  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return 'Browser pages cannot be recorded. Open an http or https page.'
  }

  if (parsed.protocol === 'file:') {
    return 'Local files need "Allow access to file URLs" enabled for this extension.'
  }

  return null
}

export function isRecordableUrl(url: string | undefined): boolean {
  return blockedReason(url) === null
}

export async function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id === undefined ? null : tab
}

export async function getActiveTab(): Promise<Result<chrome.tabs.Tab>> {
  const tab = await queryActiveTab()

  if (!tab) {
    return fail('No active tab was found.')
  }

  const reason = blockedReason(tab.url)

  return reason ? fail(reason) : ok(tab)
}

export async function readViewport(tabId: number): Promise<string | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => `${window.innerWidth}x${window.innerHeight}`,
    })

    return typeof result?.result === 'string' ? result.result : null
  } catch {
    return null
  }
}

const PING_ATTEMPTS = 5
const PING_INTERVAL_MS = 100

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pingUntilReady(tabId: number, attempts: number): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await delay(PING_INTERVAL_MS)
    }

    const response = await sendToTab(tabId, { type: 'CONTENT_PING' })

    if (response.ok) {
      return true
    }
  }

  return false
}

export async function ensureContentScript(tabId: number): Promise<Result<true>> {
  if (await pingUntilReady(tabId, 1)) {
    return ok(true)
  }

  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js

  if (!files?.length) {
    return fail('The content script is missing from the extension bundle.')
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not inject the content script.')
  }

  return (await pingUntilReady(tabId, PING_ATTEMPTS))
    ? ok(true)
    : fail('The content script did not respond after injection. Reload the page and try again.')
}

export async function installConsoleCapture(tabId: number, sessionId: string): Promise<Result<true>> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: installConsoleBridge,
      args: [CONSOLE_CHANNEL, sessionId],
    })

    return ok(true)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not install the console capture.')
  }
}
