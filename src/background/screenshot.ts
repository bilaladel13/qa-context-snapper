import { fail, ok } from '@/messaging/protocol'
import type { Result } from '@/messaging/protocol'
import type { ScreenshotMeta } from '@/types'

// JPEG rather than PNG: a page screenshot is mostly flat colour and large text,
// which JPEG carries at a fraction of the size. Quality 85 keeps body text
// legible, which is the whole point of attaching it to a bug report.
const FORMAT = 'jpeg'
const QUALITY = 85
const FALLBACK_QUALITY = 60

// A capture travels through session storage and then over a message port to the
// popup, so it is bounded on both dimensions and bytes rather than trusting a
// 4K display to produce something sensible.
const MAX_WIDTH = 1600
const MAX_BYTES = 3 * 1024 * 1024

export interface Capture {
  dataUrl: string
  meta: ScreenshotMeta
}

function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

function byteLength(dataUrl: string): number {
  const base64 = base64Of(dataUrl)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0

  return Math.floor((base64.length * 3) / 4) - padding
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []

  // Chunked because a per byte concatenation over a few hundred kilobytes is
  // quadratic in some engines, and spreading the whole array into apply would
  // overflow the argument limit.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }

  return `data:${blob.type};base64,${btoa(chunks.join(''))}`
}

async function reencode(bitmap: ImageBitmap, width: number, quality: number): Promise<string> {
  const scale = Math.min(1, width / bitmap.width)
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  )

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('The screenshot could not be redrawn.')
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const blob = await canvas.convertToBlob({ type: `image/${FORMAT}`, quality: quality / 100 })

  return toDataUrl(blob)
}

export async function captureTab(tabId: number): Promise<Result<Capture>> {
  let tab: chrome.tabs.Tab

  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return fail('The recorded tab is no longer open.')
  }

  // captureVisibleTab photographs whatever that window is showing, not a tab of
  // our choosing. Stopping from the keyboard while looking at a different tab
  // would otherwise attach a screenshot of the wrong page.
  if (!tab.active) {
    return fail('The recorded tab was not in view, so no screenshot was taken.')
  }

  let captured: string

  try {
    captured = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: FORMAT,
      quality: QUALITY,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The screenshot could not be taken.')
  }

  try {
    const bitmap = await createImageBitmap(await (await fetch(captured)).blob())

    try {
      const oversized = bitmap.width > MAX_WIDTH
      let dataUrl = oversized ? await reencode(bitmap, MAX_WIDTH, QUALITY) : captured

      if (byteLength(dataUrl) > MAX_BYTES) {
        dataUrl = await reencode(bitmap, MAX_WIDTH, FALLBACK_QUALITY)
      }

      if (byteLength(dataUrl) > MAX_BYTES) {
        return fail('The screenshot was too large to attach.')
      }

      const scale = oversized ? MAX_WIDTH / bitmap.width : 1

      return ok({
        dataUrl,
        meta: {
          width: Math.round(bitmap.width * scale),
          height: Math.round(bitmap.height * scale),
          bytes: byteLength(dataUrl),
          capturedAt: new Date().toISOString(),
        },
      })
    } finally {
      bitmap.close()
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The screenshot could not be processed.')
  }
}
