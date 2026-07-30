import { Button } from '@/components/Button'
import { Section } from '@/components/Section'
import { useElapsed } from '@/popup/useElapsed'
import type { RecorderState } from '@/types'

interface RecordingViewProps {
  state: RecorderState
  pending: boolean
  onStop: () => void
}

export function RecordingView({ state, pending, onStop }: RecordingViewProps) {
  const elapsed = useElapsed(state.startedAt)

  return (
    <>
      <main className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-3 rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-3">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-rose-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-100">Recording in progress</p>
            <p className="truncate text-[11px] text-rose-300/80">{state.tabTitle ?? state.tabUrl}</p>
          </div>
          <span className="font-mono text-sm tabular-nums text-rose-200">{elapsed}</span>
        </div>

        <Section title="Captured so far">
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded border border-surface-border py-2">
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">Interactions</dt>
              <dd className="text-lg font-semibold text-slate-100">{state.interactionCount}</dd>
            </div>
            <div className="rounded border border-surface-border py-2">
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">Console errors</dt>
              <dd className="text-lg font-semibold text-slate-100">{state.consoleErrorCount}</dd>
            </div>
          </dl>
        </Section>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          Reproduce the issue on the page. You can close this popup, recording continues.
        </p>
      </main>

      <footer className="border-t border-surface-border px-4 py-3">
        <Button variant="danger" onClick={onStop} disabled={pending} className="w-full">
          {pending ? 'Stopping' : 'Stop and Generate Script'}
        </Button>
      </footer>
    </>
  )
}
