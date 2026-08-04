import type { InteractionEvent } from '@/types'

const TYPE_LABELS: Record<InteractionEvent['type'], string> = {
  click: 'click',
  input: 'fill',
  change: 'select',
  submit: 'submit',
  keydown: 'press',
  navigation: 'goto',
  assertion: 'expect',
  marker: 'step',
}

const ASSERTION_LABELS: Record<string, string> = {
  visible: 'is visible',
  hidden: 'is hidden',
  text: 'contains',
  exactText: 'has text',
  value: 'has value',
  enabled: 'is enabled',
  disabled: 'is disabled',
  checked: 'is checked',
  unchecked: 'is not checked',
  count: 'has count',
  attribute: 'has attribute',
  url: 'page url is',
  title: 'page title is',
}

function describeTarget(step: InteractionEvent): string {
  if (step.type === 'assertion') {
    const detail = step.assertion
    const subject = step.target?.value ?? 'page'
    const check = ASSERTION_LABELS[detail?.kind ?? ''] ?? 'check'

    return detail?.kind === 'url' || detail?.kind === 'title'
      ? `${check} ${detail.expected ?? ''}`
      : `${subject} ${check}`
  }

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
      {steps.map((step, index) =>
        step.type === 'marker' ? (
          <li
            key={step.id}
            className="mt-2 border-t border-surface-border pt-2 text-[11px] font-semibold text-ink first:mt-0 first:border-0 first:pt-0"
          >
            {step.value}
          </li>
        ) : (
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
        ),
      )}
    </ol>
  )
}
