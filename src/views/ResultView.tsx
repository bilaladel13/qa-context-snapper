import { useState } from 'react'
import { Button } from '@/components/Button'
import { CodeBlock } from '@/components/CodeBlock'
import { ConsoleErrorsPanel } from '@/components/ConsoleErrorsPanel'
import { StepsPanel } from '@/components/StepsPanel'
import type { RecorderState } from '@/types'

type Tab = 'markdown' | 'playwright'

const TABS: { id: Tab; label: string }[] = [
  { id: 'markdown', label: 'Bug Report' },
  { id: 'playwright', label: 'Playwright' },
]

const PLACEHOLDERS: Record<Tab, string> = {
  markdown: 'No bug report was generated for this recording.',
  playwright: 'No Playwright script was generated for this recording.',
}

interface ResultViewProps {
  state: RecorderState
  pending: boolean
  onReset: () => void
}

export function ResultView({ state, pending, onReset }: ResultViewProps) {
  const [active, setActive] = useState<Tab>('markdown')

  const content =
    active === 'markdown' ? (state.report?.markdown ?? '') : (state.report?.playwrightScript ?? '')

  return (
    <>
      <main className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-raised p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-pressed={active === tab.id}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                active === tab.id
                  ? 'bg-accent-strong text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <CodeBlock content={content} placeholder={PLACEHOLDERS[active]} />

        {state.snapshot === null ? (
          <p className="rounded border border-amber-900 bg-amber-950/40 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            No captured data is available for this recording.
          </p>
        ) : (
          <>
            <StepsPanel steps={state.snapshot.interactions} />
            <ConsoleErrorsPanel errors={state.snapshot.consoleErrors} />
          </>
        )}
      </main>

      <footer className="border-t border-surface-border px-4 py-3">
        <Button variant="ghost" onClick={onReset} disabled={pending} className="w-full">
          Start Over
        </Button>
      </footer>
    </>
  )
}
