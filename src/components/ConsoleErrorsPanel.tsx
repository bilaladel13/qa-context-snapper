import type { ConsoleErrorEntry } from '@/types'

const LEVEL_STYLES: Record<ConsoleErrorEntry['level'], string> = {
  error: 'border-danger-border bg-danger-surface text-danger-ink',
  warn: 'border-warn-border bg-warn-surface text-warn-ink',
  unhandledrejection: 'border-notice-border bg-notice-surface text-notice-ink',
}

const LEVEL_LABELS: Record<ConsoleErrorEntry['level'], string> = {
  error: 'error',
  warn: 'warn',
  unhandledrejection: 'rejection',
}

function shortSource(entry: ConsoleErrorEntry): string | null {
  if (!entry.source) {
    return null
  }

  const file = entry.source.split('/').pop() || entry.source
  return entry.lineNumber ? `${file}:${entry.lineNumber}` : file
}

interface ConsoleErrorsPanelProps {
  errors: ConsoleErrorEntry[]
}

export function ConsoleErrorsPanel({ errors }: ConsoleErrorsPanelProps) {
  if (errors.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        No console errors were captured
      </p>
    )
  }

  return (
    <ul className="max-h-36 space-y-1.5 overflow-y-auto">
      {errors.map((entry) => {
        const source = shortSource(entry)

        return (
          <li key={entry.id} className="rounded border border-surface-border bg-surface p-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wider ${LEVEL_STYLES[entry.level]}`}
              >
                {LEVEL_LABELS[entry.level]}
              </span>
              {source ? <span className="truncate text-[10px] text-ink-subtle">{source}</span> : null}
            </div>
            <p className="mt-1 line-clamp-3 font-mono text-[10px] leading-relaxed text-ink-muted">
              {entry.message}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
