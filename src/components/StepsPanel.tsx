import { TrashIcon } from '@/components/icons'
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
  notText: 'does not contain',
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
  onDeleteStep?: (stepId: string) => void
}

export function StepsPanel({ steps, onDeleteStep }: StepsPanelProps) {
  if (steps.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        No interactions were captured
      </p>
    )
  }

  return (
    <ol className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
      {steps.map((step, index) =>
        step.type === 'marker' ? (
          <li
            key={step.id}
            className="group mt-2 flex items-center justify-between border-t border-surface-border pt-2 text-[11px] font-semibold text-ink first:mt-0 first:border-0 first:pt-0"
          >
            <span>{step.value}</span>
            {onDeleteStep ? (
              <button
                type="button"
                onClick={() => onDeleteStep(step.id)}
                title="Delete this step"
                aria-label={`Delete step ${step.value ?? index + 1}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-ink-subtle hover:bg-danger-surface hover:text-danger-ink transition-opacity"
              >
                <TrashIcon className="size-3" />
              </button>
            ) : null}
          </li>
        ) : (
          <li
            key={step.id}
            className="group flex items-center gap-2 rounded px-1 -mx-1 py-0.5 text-[11px] leading-relaxed hover:bg-surface-hover/50"
          >
            <span className="w-4 shrink-0 text-right font-mono text-ink-subtle">{index + 1}</span>
            <span className="shrink-0 font-mono font-semibold text-accent">
              {TYPE_LABELS[step.type]}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">
              {describeTarget(step)}
              {step.value && step.type !== 'navigation' ? (
                <span className={step.masked ? 'text-warn-ink' : 'text-ink'}> = {step.value}</span>
              ) : null}
              {step.type === 'assertion' && step.assertion?.isViolation ? (
                <span className="ml-1 text-[10px] font-semibold text-danger-ink">❌ bug</span>
              ) : null}
            </span>
            {onDeleteStep ? (
              <button
                type="button"
                onClick={() => onDeleteStep(step.id)}
                title="Delete this step"
                aria-label={`Delete step ${index + 1}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 rounded p-0.5 text-ink-subtle hover:bg-danger-surface hover:text-danger-ink transition-opacity"
              >
                <TrashIcon className="size-3" />
              </button>
            ) : null}
          </li>
        ),
      )}
    </ol>
  )
}
