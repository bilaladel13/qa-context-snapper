import type { ConsoleErrorEntry } from '@/types'
import { Section } from './Section'

const LEVEL_STYLES: Record<ConsoleErrorEntry['level'], string> = {
  error: 'border-rose-900 text-rose-300',
  warn: 'border-amber-900 text-amber-300',
  unhandledrejection: 'border-fuchsia-900 text-fuchsia-300',
}

const LEVEL_LABELS: Record<ConsoleErrorEntry['level'], string> = {
  error: 'error',
  warn: 'warn',
  unhandledrejection: 'rejection',
}

interface ConsoleErrorsPanelProps {
  errors: ConsoleErrorEntry[]
}

export function ConsoleErrorsPanel({ errors }: ConsoleErrorsPanelProps) {
  return (
    <Section title="Recent Console Errors" badge={`${errors.length} captured`}>
      {errors.length === 0 ? (
        <div className="rounded border border-dashed border-surface-border px-3 py-3 text-center">
          <p className="text-xs text-slate-400">No console errors were captured</p>
        </div>
      ) : (
        <ul className="max-h-32 space-y-1.5 overflow-auto">
          {errors.map((entry) => (
            <li key={entry.id} className="rounded border border-surface-border bg-surface p-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wider ${LEVEL_STYLES[entry.level]}`}
                >
                  {LEVEL_LABELS[entry.level]}
                </span>
                {entry.source ? (
                  <span className="truncate text-[10px] text-slate-500">
                    {entry.source.split('/').pop()}
                    {entry.lineNumber ? `:${entry.lineNumber}` : ''}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-3 font-mono text-[10px] leading-relaxed text-slate-300">
                {entry.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
