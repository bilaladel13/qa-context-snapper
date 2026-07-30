interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-2">
      <p className="flex-1 text-[11px] leading-relaxed text-rose-200">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="text-xs font-semibold text-rose-300 hover:text-rose-100"
      >
        x
      </button>
    </div>
  )
}
