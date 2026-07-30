import { useCallback, useEffect, useRef, useState } from 'react'
import { HelpIcon } from './icons'

const PANEL_WIDTH = 220
const MARGIN = 8
const FLIP_THRESHOLD = 380

interface Position {
  left: number
  top?: number
  bottom?: number
}

interface TooltipProps {
  label: string
  text: string
}

// The popup body clips overflow and the settings list scrolls, so an absolutely
// positioned panel would be cut off. Fixed positioning measured from the
// trigger escapes both.
export function Tooltip({ label, text }: TooltipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const show = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const maxLeft = document.documentElement.clientWidth - PANEL_WIDTH - MARGIN
    const left = Math.min(Math.max(rect.left + rect.width / 2 - PANEL_WIDTH / 2, MARGIN), maxLeft)

    setPosition(
      rect.bottom > FLIP_THRESHOLD
        ? { left, bottom: document.documentElement.clientHeight - rect.top + 6 }
        : { left, top: rect.bottom + 6 },
    )
  }, [])

  const hide = useCallback(() => setPosition(null), [])

  useEffect(() => {
    if (!position) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [position, hide])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`What is ${label}?`}
        className="rounded-full text-ink-subtle transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (position ? hide() : show())}
      >
        <HelpIcon className="size-3.5" />
      </button>

      {position ? (
        <div
          role="tooltip"
          style={{ width: PANEL_WIDTH, ...position }}
          className="fixed z-50 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[11px] leading-relaxed text-ink-muted shadow-lg shadow-black/25"
        >
          {text}
        </div>
      ) : null}
    </>
  )
}
