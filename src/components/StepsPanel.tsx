import { useState } from 'react'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '@/components/icons'
import { describeStep, formatExpectedAssertion, isCheckboxOrRadio } from '@/generator/shared'
import type { InteractionEvent } from '@/types'

const TYPE_LABELS: Record<InteractionEvent['type'], string> = {
  click: 'click',
  input: 'enter',
  change: 'select',
  submit: 'submit',
  keydown: 'press',
  navigation: 'goto',
  assertion: 'expect',
  marker: 'step',
}

interface StepsPanelProps {
  steps: InteractionEvent[]
  onDeleteStep?: (stepId: string) => void
  onUpdateStep?: (stepId: string, patch: { customAction?: string; customExpected?: string }) => void
}

export function StepsPanel({ steps, onDeleteStep, onUpdateStep }: StepsPanelProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'action' | 'expected' | null>(null)
  const [draftValue, setDraftValue] = useState('')

  const handleStartEdit = (stepId: string, field: 'action' | 'expected', initialVal: string) => {
    setEditingStepId(stepId)
    setEditingField(field)
    setDraftValue(initialVal)
  }

  const handleCancelEdit = () => {
    setEditingStepId(null)
    setEditingField(null)
    setDraftValue('')
  }

  const handleSaveEdit = (step: InteractionEvent) => {
    if (!onUpdateStep || !editingField) return
    const trimmed = draftValue.trim()
    if (editingField === 'action') {
      onUpdateStep(step.id, { customAction: trimmed || undefined })
    } else {
      onUpdateStep(step.id, { customExpected: trimmed || undefined })
    }
    handleCancelEdit()
  }

  if (steps.length === 0) {
    return (
      <p className="rounded border border-dashed border-surface-border px-3 py-3 text-center text-xs text-ink-muted">
        No interactions were captured
      </p>
    )
  }

  return (
    <ol className="max-h-60 space-y-2 overflow-y-auto pr-0.5">
      {steps.map((step, index) => {
        if (step.type === 'marker') {
          return (
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
          )
        }

        const isEditingAction = editingStepId === step.id && editingField === 'action'
        const isEditingExpected = editingStepId === step.id && editingField === 'expected'

        const currentAction = step.customAction || describeStep(step)
        const currentExpected =
          step.customExpected ||
          (step.type === 'assertion' ? step.assertion?.message || formatExpectedAssertion(step) : '')

        return (
          <li
            key={step.id}
            className="group rounded-md border border-surface-border/60 bg-surface-base/60 p-2 text-[11px] leading-relaxed hover:border-surface-border hover:bg-surface-hover/30 transition-colors"
          >
            {/* Header row: Step #, badge, action and delete */}
            <div className="flex items-start gap-1.5">
              <span className="w-4 shrink-0 pt-0.5 text-right font-mono text-ink-subtle">
                {index + 1}
              </span>
              <span className="shrink-0 pt-0.5 font-mono font-semibold text-accent">
                {isCheckboxOrRadio(step.target) ? 'check' : TYPE_LABELS[step.type]}
              </span>

              {/* Action content or editor */}
              <div className="min-w-0 flex-1">
                {isEditingAction ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(step)
                        if (e.key === 'Escape') handleCancelEdit()
                      }}
                      autoFocus
                      className="w-full rounded border border-accent bg-surface-raised px-2 py-0.5 text-[11px] text-ink focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(step)}
                      title="Save action"
                      className="rounded p-1 text-accent hover:bg-accent/10"
                    >
                      <CheckIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      title="Cancel"
                      className="rounded p-1 text-ink-subtle hover:bg-surface-hover"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group/act">
                    <span
                      onClick={() =>
                        onUpdateStep && handleStartEdit(step.id, 'action', currentAction)
                      }
                      title={onUpdateStep ? 'Click to edit action text' : undefined}
                      className={`min-w-0 flex-1 truncate text-ink ${
                        onUpdateStep ? 'cursor-pointer hover:text-accent transition-colors' : ''
                      }`}
                    >
                      {currentAction}
                    </span>
                    {onUpdateStep ? (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(step.id, 'action', currentAction)}
                        title="Edit action text"
                        className="opacity-0 group-hover/act:opacity-100 rounded p-0.5 text-ink-subtle hover:text-accent transition-opacity"
                      >
                        <EditIcon className="size-2.5" />
                      </button>
                    ) : null}
                    {step.type === 'assertion' && step.assertion?.isViolation ? (
                      <span className="shrink-0 rounded border border-danger-border/40 bg-danger-surface px-1 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-danger-ink">
                        Violation
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {onDeleteStep ? (
                <button
                  type="button"
                  onClick={() => onDeleteStep(step.id)}
                  title="Delete this step"
                  aria-label={`Delete step ${index + 1}`}
                  className="shrink-0 rounded p-0.5 text-ink-subtle hover:bg-danger-surface hover:text-danger-ink transition-colors"
                >
                  <TrashIcon className="size-3" />
                </button>
              ) : null}
            </div>

            {/* Sub-row: Expected Result */}
            <div className="mt-1 pl-5">
              {isEditingExpected ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0 font-semibold text-[10px] text-emerald-500">
                    Expected:
                  </span>
                  <input
                    type="text"
                    value={draftValue}
                    placeholder="Expected result in your own words..."
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(step)
                      if (e.key === 'Escape') handleCancelEdit()
                    }}
                    autoFocus
                    className="w-full rounded border border-emerald-500 bg-surface-raised px-2 py-0.5 text-[10px] text-ink focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(step)}
                    title="Save expected result"
                    className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    <CheckIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    title="Cancel"
                    className="rounded p-1 text-ink-subtle hover:bg-surface-hover"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </div>
              ) : currentExpected ? (
                <div className="flex items-center gap-1 group/exp">
                  <span className="shrink-0 font-semibold text-[10px] text-emerald-500">
                    Expected:
                  </span>
                  <span
                    onClick={() =>
                      onUpdateStep && handleStartEdit(step.id, 'expected', currentExpected)
                    }
                    title={onUpdateStep ? 'Click to edit expected result' : undefined}
                    className={`min-w-0 flex-1 truncate text-[10px] text-emerald-400/90 ${
                      onUpdateStep ? 'cursor-pointer hover:underline' : ''
                    }`}
                  >
                    {currentExpected}
                  </span>
                  {onUpdateStep ? (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(step.id, 'expected', currentExpected)}
                      title="Edit expected result"
                      className="opacity-0 group-hover/exp:opacity-100 rounded p-0.5 text-ink-subtle hover:text-emerald-400 transition-opacity"
                    >
                      <EditIcon className="size-2.5" />
                    </button>
                  ) : null}
                </div>
              ) : onUpdateStep ? (
                <button
                  type="button"
                  onClick={() => handleStartEdit(step.id, 'expected', '')}
                  className="text-[10px] text-ink-subtle hover:text-accent transition-colors"
                >
                  + Add Expected Result
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
