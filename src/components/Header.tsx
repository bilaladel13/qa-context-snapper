import { IconButton } from './IconButton'
import { BackIcon, GearIcon } from './icons'

interface HeaderProps {
  version: string
  recording: boolean
  onOpenSettings: () => void
  onBack?: () => void
  title?: string
}

export function Header({ version, recording, onOpenSettings, onBack, title }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {onBack ? (
          <IconButton label="Back" icon={<BackIcon />} onClick={onBack} />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-strong text-sm font-bold text-on-accent">
            QA
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-ink">
            {title ?? 'QA Context Snapper'}
          </h1>
          {title ? null : (
            <p className="truncate text-[11px] text-ink-muted">Bug report and Playwright generator</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {recording ? (
          <span className="flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger-ink">
            <span className="size-1.5 animate-pulse rounded-full bg-danger" />
            Rec
          </span>
        ) : (
          <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
            v{version}
          </span>
        )}
        {onBack ? null : (
          <IconButton label="Settings" icon={<GearIcon />} onClick={onOpenSettings} />
        )}
      </div>
    </header>
  )
}
