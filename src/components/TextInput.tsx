import type { InputHTMLAttributes } from 'react'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  mono?: boolean
}

export function TextInput({ invalid = false, mono = false, className = '', ...props }: TextInputProps) {
  return (
    <input
      type="text"
      spellCheck={false}
      autoComplete="off"
      className={`w-full rounded-lg border bg-surface px-2.5 py-1.5 text-xs text-ink transition-colors placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        invalid ? 'border-danger-border' : 'border-surface-border'
      } ${mono ? 'font-mono' : ''} ${className}`}
      {...props}
    />
  )
}
