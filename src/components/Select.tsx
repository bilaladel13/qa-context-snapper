import type { SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[]
  placeholder?: string
}

export function Select({ options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <select
      className={`w-full appearance-none rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
