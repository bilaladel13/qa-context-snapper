import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { CodeBlock } from '@/components/CodeBlock'
import { Collapsible } from '@/components/Collapsible'
import { ConsoleErrorsPanel } from '@/components/ConsoleErrorsPanel'
import { SegmentedControl } from '@/components/SegmentedControl'
import { StepsPanel } from '@/components/StepsPanel'
import { JiraIcon, ResetIcon } from '@/components/icons'
import type { RecorderState } from '@/types'

type Tab = 'markdown' | 'playwright'

const PLACEHOLDERS: Record<Tab, string> = {
  markdown: 'No bug report was generated for this recording.',
  playwright: 'No Playwright script was generated for this recording.',
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug || 'recording'
}

interface ResultViewProps {
  state: RecorderState
  pending: boolean
  onReset: () => void
  onCreateTicket: () => void
}

export function ResultView({ state, pending, onReset, onCreateTicket }: ResultViewProps) {
  const [active, setActive] = useState<Tab>('markdown')

  const baseName = useMemo(() => {
    const title = state.snapshot?.environment.pageTitle || state.tabTitle || 'recording'
    const date = new Date(state.stoppedAt ?? Date.now()).toISOString().slice(0, 10)
    return `${slugify(title)}-${date}`
  }, [state.snapshot, state.tabTitle, state.stoppedAt])

  // Each tab keeps its own name so switching back and forth does not overwrite
  // a filename the tester already adjusted.
  const [names, setNames] = useState<Record<Tab, string | null>>({
    markdown: null,
    playwright: null,
  })

  const isMarkdown = active === 'markdown'
  const extension = isMarkdown ? '.md' : '.spec.ts'
  const filename = names[active] ?? `${baseName}${extension}`

  const content = isMarkdown
    ? (state.report?.markdown ?? '')
    : (state.report?.playwrightScript ?? '')

  const snapshot = state.snapshot

  return (
    <>
      {/* No scrolling here: main must stay a bounded flex column so the code
          block below can claim the leftover height instead of being pushed
          out of the 600px popup by the panels. */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
        <div className="shrink-0">
          <SegmentedControl
            full
            label="Generated output"
            value={active}
            onChange={setActive}
            options={[
              { value: 'markdown', label: 'Bug Report' },
              { value: 'playwright', label: 'Playwright' },
            ]}
          />
        </div>

        <CodeBlock
          content={content}
          placeholder={PLACEHOLDERS[active]}
          filename={filename}
          extension={extension}
          onFilenameChange={(next) => setNames((current) => ({ ...current, [active]: next }))}
        />

        {snapshot === null ? (
          <p className="shrink-0 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
            No captured data is available for this recording.
          </p>
        ) : (
          <div className="max-h-52 shrink-0 space-y-2 overflow-y-auto">
            <Collapsible title="Recorded Steps" badge={`${snapshot.interactions.length}`}>
              <StepsPanel steps={snapshot.interactions} />
            </Collapsible>

            <Collapsible title="Console Errors" badge={`${snapshot.consoleErrors.length}`}>
              <ConsoleErrorsPanel errors={snapshot.consoleErrors} />
            </Collapsible>
          </div>
        )}
      </main>

      <footer className="shrink-0 space-y-2 border-t border-surface-border px-4 py-3">
        <Button
          onClick={onCreateTicket}
          disabled={pending || snapshot === null}
          className="w-full"
          icon={<JiraIcon className="size-3.5" />}
        >
          Create Jira Ticket
        </Button>
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={pending}
          className="w-full py-2 text-xs"
          icon={<ResetIcon className="size-3.5" />}
        >
          Start Over
        </Button>
      </footer>
    </>
  )
}
