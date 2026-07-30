import type { ReactNode } from 'react'
import { ChevronRightIcon } from './icons'

interface CollapsibleProps {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Collapsible({ title, badge, defaultOpen = false, children }: CollapsibleProps) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-surface-border bg-surface-raised"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRightIcon className="size-3 shrink-0 text-ink-subtle transition-transform group-open:rotate-90" />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {title}
          </span>
        </span>
        {badge ? (
          <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {badge}
          </span>
        ) : null}
      </summary>

      <div className="border-t border-surface-border px-3 py-2.5">{children}</div>
    </details>
  )
}
