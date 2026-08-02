import { fail, ok } from '@/messaging/protocol'
import type { Result } from '@/messaging/protocol'

// Chrome rejects absolute paths, traversal and reserved characters outright.
export function sanitizeFilename(input: string, fallback: string, extension: string): string {
  const base = input.split(/[\\/]/).pop() ?? ''

  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/-{2,}/g, '-')
    .replace(/[-.]+$/, '')

  const name = cleaned || fallback

  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`
}

// Chrome derives a download's extension from its MIME type, and on Windows it
// asks the registry for the mapping. Two ways that has already gone wrong:
//
//   text/plain               -> appended .txt   (email-bug.spec.ts.txt)
//   application/octet-stream -> whatever app claimed the generic type in
//                               HKEY_CLASSES_ROOT\MIME\Database\Content Type
//                               (Logisim claims it, giving email-bug.spec.circ)
//
// So the type is matched to the extension being written, and deliberately not
// text/javascript, which Chrome maps to .js and would append it to a .ts name.
// application/typescript has no built in Chrome mapping and is not a type
// desktop software competes to own.
const MIME_TYPES: [string, string][] = [
  ['.md', 'text/markdown'],
  ['.ts', 'application/typescript'],
]

const DEFAULT_MIME_TYPE = 'application/typescript'

export function mimeForFilename(filename: string): string {
  const lower = filename.toLowerCase()
  return MIME_TYPES.find(([extension]) => lower.endsWith(extension))?.[1] ?? DEFAULT_MIME_TYPE
}

export function buildDownloadUrl(content: string, filename: string): string {
  const bytes = new TextEncoder().encode(content)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return `data:${mimeForFilename(filename)};base64,${btoa(binary)}`
}

// Any MIME to extension inference can be overridden by whatever the machine has
// registered, so the name is also asserted directly. onDeterminingFilename wins
// over Chrome's own derivation, which makes the saved name independent of both
// the MIME table and the local registry.
const expectedNames: string[] = []

chrome.downloads?.onDeterminingFilename?.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) {
    return
  }

  const filename = expectedNames.shift()

  if (filename) {
    suggest({ filename, conflictAction: 'uniquify' })
  }
})

export interface DownloadInput {
  content: string
  filename: string
}

// Runs in the worker rather than the popup on purpose. The Save As dialog takes
// focus, which closes the popup, and a blob URL owned by a closed popup is
// revoked before Chrome can read it. Service workers have no createObjectURL at
// all, so the payload travels as a data URL.
export async function startDownload(
  input: DownloadInput,
): Promise<Result<{ downloadId: number | null; cancelled: boolean }>> {
  expectedNames.push(input.filename)

  try {
    const downloadId = await chrome.downloads.download({
      url: buildDownloadUrl(input.content, input.filename),
      filename: input.filename,
      saveAs: true,
    })

    return ok({ downloadId, cancelled: false })
  } catch (error) {
    // The listener already consumed the entry if the dialog was reached.
    const queued = expectedNames.indexOf(input.filename)
    if (queued !== -1) {
      expectedNames.splice(queued, 1)
    }

    const message = error instanceof Error ? error.message : 'The download could not be started.'

    // Dismissing the Save As dialog is a choice, not a failure.
    if (/cancel/i.test(message)) {
      return ok({ downloadId: null, cancelled: true })
    }

    return fail(message)
  }
}
