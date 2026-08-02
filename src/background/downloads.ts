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

function toDataUrl(content: string, mimeType: string): string {
  const bytes = new TextEncoder().encode(content)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return `data:${mimeType};charset=utf-8;base64,${btoa(binary)}`
}

export interface DownloadInput {
  content: string
  filename: string
  mimeType: string
}

// Runs in the worker rather than the popup on purpose. The Save As dialog takes
// focus, which closes the popup, and a blob URL owned by a closed popup is
// revoked before Chrome can read it. Service workers have no createObjectURL at
// all, so the payload travels as a data URL.
export async function startDownload(
  input: DownloadInput,
): Promise<Result<{ downloadId: number | null; cancelled: boolean }>> {
  try {
    const downloadId = await chrome.downloads.download({
      url: toDataUrl(input.content, input.mimeType),
      filename: input.filename,
      saveAs: true,
    })

    return ok({ downloadId, cancelled: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The download could not be started.'

    // Dismissing the Save As dialog is a choice, not a failure.
    if (/cancel/i.test(message)) {
      return ok({ downloadId: null, cancelled: true })
    }

    return fail(message)
  }
}
