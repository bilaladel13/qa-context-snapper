import type { NetworkEntry } from '@/types'

function label(entry: NetworkEntry): string {
  return entry.status === null ? 'failed' : String(entry.status)
}

function path(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || parsed.hostname
  } catch {
    return url
  }
}

interface NetworkPanelProps {
  entries: NetworkEntry[]
}

export function NetworkPanel({ entries }: NetworkPanelProps) {
  const failures = entries.filter((entry) => entry.outcome !== 'success')

  if (entries.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        No network activity was captured
      </p>
    )
  }

  if (failures.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        All {entries.length} captured request{entries.length === 1 ? '' : 's'} succeeded
      </p>
    )
  }

  return (
    <ul className="max-h-36 space-y-1.5 overflow-y-auto">
      {failures.map((entry) => (
        <li key={entry.id} className="rounded border border-surface-border bg-surface p-2">
          <div className="flex items-center gap-2">
            <span className="rounded border border-danger-border bg-danger-surface px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-danger-ink">
              {label(entry)}
            </span>
            <span className="font-mono text-[10px] font-semibold text-ink-muted">
              {entry.method}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-ink-subtle">
              {entry.durationMs} ms
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-ink-muted" title={entry.url}>
            {path(entry.url)}
          </p>
        </li>
      ))}
    </ul>
  )
}
