import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  badge?: string
  children: ReactNode
}

export function Section({ title, badge, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-surface-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </h2>
        {badge ? (
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}
