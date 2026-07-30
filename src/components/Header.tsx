interface HeaderProps {
  version: string
  recording: boolean
}

export function Header({ version, recording }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-surface-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-strong text-sm font-bold text-white">
          QA
        </span>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-slate-50">QA Context Snapper</h1>
          <p className="text-[11px] text-slate-400">Bug report and Playwright script generator</p>
        </div>
      </div>
      {recording ? (
        <span className="rounded-full border border-rose-800 bg-rose-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
          Rec
        </span>
      ) : (
        <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] font-medium text-slate-400">
          v{version}
        </span>
      )}
    </header>
  )
}
