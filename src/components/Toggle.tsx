interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        checked ? 'bg-accent-strong' : 'bg-surface-border'
      }`}
    >
      <span
        className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]'
        }`}
      />
    </button>
  )
}
