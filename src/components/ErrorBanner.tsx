interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2"
    >
      <p className="flex-1 text-[11px] leading-relaxed text-danger-ink">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded px-1 text-xs font-semibold text-danger-ink transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Dismiss
      </button>
    </div>
  )
}
