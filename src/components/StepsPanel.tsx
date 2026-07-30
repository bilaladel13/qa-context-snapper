import type { InteractionEvent } from '@/types'

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
    try {
      const url = new URL(step.value ?? '')
      return `${url.pathname}${url.search}` || url.hostname
    } catch {
      return step.value ?? ''
    }
  }

  if (!step.target) {
    return step.key ?? ''
  }

  const { strategy, value, accessibleName } = step.target

  return strategy === 'role' && accessibleName ? `${value} "${accessibleName}"` : value
}

interface StepsPanelProps {
  steps: InteractionEvent[]
}

export function StepsPanel({ steps }: StepsPanelProps) {
  if (steps.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        No interactions were captured
      </p>
    )
  }

  return (
    <ol className="max-h-36 space-y-1 overflow-y-auto">
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
          <span className="w-4 shrink-0 text-right font-mono text-ink-subtle">{index + 1}</span>
          <span className="shrink-0 font-mono font-semibold text-accent">
            {TYPE_LABELS[step.type]}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">
            {describeTarget(step)}
            {step.value && step.type !== 'navigation' ? (
              <span className={step.masked ? 'text-warn-ink' : 'text-ink'}> = {step.value}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
