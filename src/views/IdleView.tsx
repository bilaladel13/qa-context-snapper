import { Button } from '@/components/Button'
import { EnvironmentPanel } from '@/components/EnvironmentPanel'
import { RecordIcon } from '@/components/icons'
import type { EnvironmentState } from '@/popup/useEnvironment'

interface IdleViewProps {
  environment: EnvironmentState
  pending: boolean
  shortcut: string | null
  onStart: () => void
}

export function IdleView({ environment, pending, shortcut, onStart }: IdleViewProps) {
  const blocked = environment.tab?.recordable === false
  const reason = environment.tab?.blockedReason

  return (
    <>
      <main className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          <EnvironmentPanel environment={environment.environment} loading={environment.loading} />

          {blocked && reason ? (
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
              {reason}
            </p>
          ) : (
            <ol className="space-y-1.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              <li>1. Start recording, then reproduce the bug on the page.</li>
              <li>2. Interactions and console errors are captured as you go.</li>
              <li>3. Stop to generate a bug report and a Playwright script.</li>
            </ol>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button
          onClick={onStart}
          disabled={pending || blocked}
          className="w-full"
          icon={<RecordIcon className="size-3.5" />}
        >
          {pending ? 'Starting' : 'Start Recording'}
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
