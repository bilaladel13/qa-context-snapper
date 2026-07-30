import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

interface FieldProps {
  label: string
  hint: string
  htmlFor?: string
  stacked?: boolean
  children: ReactNode
}

export function Field({ label, hint, htmlFor, stacked = false, children }: FieldProps) {
  const heading = (
    <div className="flex min-w-0 items-center gap-1.5">
      <label htmlFor={htmlFor} className="truncate text-xs font-medium text-ink">
        {label}
      </label>
      <Tooltip label={label} text={hint} />
    </div>
  )

  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        {heading}
        {children}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      {heading}
      <div className="shrink-0">{children}</div>
    </div>
  )
}
