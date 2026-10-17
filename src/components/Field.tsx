import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  hint?: string
  htmlFor?: string
  stacked?: boolean
  children: ReactNode
}

export function Field({ label, hint, htmlFor, stacked = false, children }: FieldProps) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="text-[11px] text-ink-subtle leading-tight">{hint}</p> : null}
        <div className="pt-0.5">{children}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col pr-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
          {label}
        </label>
        {hint ? <span className="text-[10px] text-ink-subtle leading-tight">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
