import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
  full?: boolean
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  full = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-0.5 rounded-lg border border-surface-border bg-surface p-0.5 ${full ? 'w-full' : ''}`}
    >
      {options.map((option) => {
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              full ? 'flex-1' : ''
            } ${
              active
                ? 'bg-accent-strong text-on-accent'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
