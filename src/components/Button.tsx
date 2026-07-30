import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-strong text-white hover:bg-accent',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  ghost: 'border border-surface-border text-slate-300 hover:bg-surface-raised hover:text-slate-100',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
