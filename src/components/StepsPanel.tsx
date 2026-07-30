import type { InteractionEvent } from '@/types'
import { Section } from './Section'

const TYPE_LABELS: Record<InteractionEvent['type'], string> = {
  click: 'click',
  input: 'fill',
  change: 'select',
  submit: 'submit',
  keydown: 'press',
  navigation: 'goto',
}

function describeTarget(step: InteractionEvent): string {
  if (step.type === 'navigation') {
    return step.value ?? ''
  }

  if (!step.target) {
    return step.key ?? ''
  }

  const { strategy, value, accessibleName } = step.target

  if (strategy === 'role') {
    return accessibleName ? `${value} "${accessibleName}"` : value
  }

  return value
}

interface StepsPanelProps {
  steps: InteractionEvent[]
}

export function StepsPanel({ steps }: StepsPanelProps) {
  return (
    <Section title="Recorded Steps" badge={`${steps.length} captured`}>
      {steps.length === 0 ? (
        <div className="rounded border border-dashed border-surface-border px-3 py-3 text-center">
          <p className="text-xs text-slate-400">No interactions were captured</p>
        </div>
      ) : (
        <ol className="max-h-40 space-y-1 overflow-auto">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
              <span className="w-4 shrink-0 text-right font-mono text-slate-600">{index + 1}</span>
              <span className="shrink-0 font-mono font-semibold text-accent">
                {TYPE_LABELS[step.type]}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-400">
                {describeTarget(step)}
                {step.value && step.type !== 'navigation' ? (
                  <span className={step.masked ? 'text-amber-400' : 'text-slate-300'}>
                    {' '}
                    = {step.value}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
