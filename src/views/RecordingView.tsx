import { Button } from '@/components/Button'
import { Section } from '@/components/Section'
import { ExternalIcon, StopIcon, TargetIcon } from '@/components/icons'
import { useElapsed } from '@/popup/useElapsed'
import type { RecorderState } from '@/types'

interface RecordingViewProps {
  state: RecorderState
  pending: boolean
  shortcut: string | null
  assertShortcut: string | null
  onStop: () => void
  onFocusTab: () => void
  onAddAssertion: () => void
}

export function RecordingView({
  state,
  pending,
  shortcut,
  assertShortcut,
  onStop,
  onFocusTab,
  onAddAssertion,
}: RecordingViewProps) {
  const elapsed = useElapsed(state.startedAt)

  return (
    <>
      <main className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-danger-border bg-danger-surface px-3 py-3">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-danger" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-danger-ink">Recording in progress</p>
              <p className="truncate text-[11px] opacity-80">
                {state.tabTitle || state.tabUrl || 'Unknown tab'}
              </p>
            </div>
            <span className="font-mono text-sm tabular-nums text-danger-ink">{elapsed}</span>
          </div>

          <Section title="Captured so far">
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded border border-surface-border py-2">
                <dt className="text-[10px] uppercase tracking-wider text-ink-subtle">Interactions</dt>
                <dd className="text-lg font-semibold text-ink">{state.interactionCount}</dd>
              </div>
              <div className="rounded border border-surface-border py-2">
                <dt className="text-[10px] uppercase tracking-wider text-ink-subtle">Errors</dt>
                <dd className="text-lg font-semibold text-ink">{state.consoleErrorCount}</dd>
              </div>
            </dl>
          </Section>

          <Button
            onClick={onAddAssertion}
            className="w-full py-2 text-xs"
            icon={<TargetIcon className="size-3.5" />}
          >
            Add assertion
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-ink-subtle">
            Picks an element on the page to check. A test that only watches for console errors
            passes even when the bug is silent.
            {assertShortcut ? (
              <>
                {' '}
                Shortcut <span className="font-mono text-ink-muted">{assertShortcut}</span>.
              </>
            ) : null}
          </p>

          <Button
            variant="ghost"
            onClick={onFocusTab}
            className="w-full py-2 text-xs"
            icon={<ExternalIcon className="size-3.5" />}
          >
            Go to recorded tab
          </Button>
        </div>
      </main>

      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button
          variant="danger"
          onClick={onStop}
          disabled={pending}
          className="w-full"
          icon={<StopIcon className="size-3.5" />}
        >
          {pending ? 'Stopping' : 'Stop and Generate'}
        </Button>
        {shortcut ? (
          <p className="mt-2 text-center text-[10px] text-ink-subtle">
            Shortcut <span className="font-mono text-ink-muted">{shortcut}</span>
          </p>
        ) : null}
      </footer>
    </>
  )
}
