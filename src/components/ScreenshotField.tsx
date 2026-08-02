import { Field } from './Field'
import { Toggle } from './Toggle'
import type { ScreenshotMeta } from '@/types'

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface ScreenshotFieldProps {
  meta: ScreenshotMeta | null
  error: string | null
  dataUrl: string | null
  attach: boolean
  onChange: (attach: boolean) => void
}

export function ScreenshotField({
  meta,
  error,
  dataUrl,
  attach,
  onChange,
}: ScreenshotFieldProps) {
  if (!meta) {
    return (
      <Field
        label="Screenshot"
        hint="Taken automatically when a recording stops, from the tab being recorded. It is only possible while that tab is the one on screen."
        stacked
      >
        <p className="text-[11px] leading-relaxed text-ink-muted">
          {error ?? 'No screenshot was captured for this recording.'}
        </p>
      </Field>
    )
  }

  return (
    <>
      <Field
        label="Attach screenshot"
        hint="Uploads the capture to the ticket after it is created. Jira only accepts attachments against an issue that already exists, so this happens as a second step."
      >
        <Toggle label="Attach screenshot" checked={attach} onChange={onChange} />
      </Field>

      {/* Shown so the reporter can confirm the capture caught the bug before
          it reaches the ticket. */}
      <div className="py-2">
        <div
          className={`overflow-hidden rounded-lg border transition-opacity ${
            attach ? 'border-surface-border opacity-100' : 'border-dashed border-surface-border opacity-40'
          }`}
        >
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Screenshot of the page when the recording stopped"
              className="block max-h-32 w-full bg-surface-sunken object-cover object-top"
            />
          ) : (
            <div className="h-20 animate-pulse bg-surface-hover" />
          )}
        </div>
        <p className="mt-1 text-[10px] text-ink-subtle">
          {meta.width} x {meta.height}, {formatSize(meta.bytes)}
        </p>
      </div>
    </>
  )
}
