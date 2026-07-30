import { Button } from '@/components/Button'
import { EnvironmentPanel } from '@/components/EnvironmentPanel'
import { Section } from '@/components/Section'

interface IdleViewProps {
  pending: boolean
  onStart: () => void
}

export function IdleView({ pending, onStart }: IdleViewProps) {
  return (
    <>
      <main className="flex flex-1 flex-col gap-3 px-4 py-3">
        <EnvironmentPanel />
        <Section title="How it works">
          <ol className="list-inside list-decimal space-y-1 text-[11px] leading-relaxed text-slate-400">
            <li>Start recording, then reproduce the bug on the page under test.</li>
            <li>Interactions and console errors are captured as you go.</li>
            <li>Stop to generate a Markdown report and a Playwright script.</li>
          </ol>
        </Section>
      </main>

      <footer className="border-t border-surface-border px-4 py-3">
        <Button onClick={onStart} disabled={pending} className="w-full">
          {pending ? 'Starting' : 'Start Recording'}
        </Button>
      </footer>
    </>
  )
}
