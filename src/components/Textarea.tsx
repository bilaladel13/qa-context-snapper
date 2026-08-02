import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rows?: number
}

export function Textarea({ rows = 3, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      spellCheck
      className={`w-full resize-y rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs leading-relaxed text-ink transition-colors placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${className}`}
      {...props}
    />
  )
}
