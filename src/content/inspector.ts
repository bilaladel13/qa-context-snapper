import { MAX_MESSAGE_LENGTH, pageAssertions, suggestAssertions, toDetail } from './assertions'
import type { AssertionOption } from './assertions'
import { resolveTarget } from './locator'
import type { AssertionDetail, ElementTarget } from '@/types'

const HOST_ID = 'qa-context-snapper-inspector'
const PANEL_WIDTH = 300
const MARGIN = 8

const STYLES = `
:host { all: initial; }
.layer {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.highlight {
  position: fixed;
  border: 2px solid #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  border-radius: 3px;
  pointer-events: none;
  transition: all 60ms linear;
}
.tag {
  position: fixed;
  padding: 2px 6px;
  border-radius: 4px;
  background: #3b82f6;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
.hint {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}
.hint.saved { background: #15803d; }
.hint button {
  all: unset;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 11px;
}
.panel {
  position: fixed;
  width: ${PANEL_WIDTH}px;
  max-height: 320px;
  overflow-y: auto;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  font-size: 12px;
}
.panel header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
}
.panel header span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.panel header button {
  all: unset;
  cursor: pointer;
  color: #94a3b8;
  font-size: 11px;
}
.group { padding: 6px; }
.group h4 {
  margin: 4px 6px;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
}
.row button.add {
  all: unset;
  flex: 1;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row button.add:hover { background: #334155; }
.row input {
  all: unset;
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #020617;
  border: 1px solid #1e293b;
  color: #e2e8f0;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.row .save {
  all: unset;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}
.reason {
  position: sticky;
  bottom: 0;
  padding: 6px;
  background: #0f172a;
  border-top: 1px solid #1e293b;
}
.reason input { width: 100%; box-sizing: border-box; }
.reason.armed input { border-color: #2563eb; }
.reason .note {
  margin: 4px 6px 0;
  color: #64748b;
  font-size: 10px;
}
.reason.armed .note { color: #60a5fa; }
`

export interface InspectorHandlers {
  onAssert: (target: ElementTarget | null, detail: AssertionDetail) => void
  onExit: () => void
}

let host: HTMLElement | null = null
let cleanup: (() => void) | null = null

export function isInspectorEvent(event: Event): boolean {
  if (!host) {
    return false
  }

  const path = typeof event.composedPath === 'function' ? event.composedPath() : []

  return path.includes(host)
}

export function isInspectorActive(): boolean {
  return host !== null
}

function elementUnder(x: number, y: number): Element | null {
  const found = document.elementFromPoint(x, y)

  return found && found !== host && found !== document.documentElement ? found : null
}

export function openInspector(handlers: InspectorHandlers): void {
  if (host) {
    return
  }

  host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = STYLES

  const layer = document.createElement('div')
  layer.className = 'layer'

  const highlight = document.createElement('div')
  highlight.className = 'highlight'
  highlight.style.display = 'none'

  const tag = document.createElement('div')
  tag.className = 'tag'
  tag.style.display = 'none'

  const hint = document.createElement('div')
  hint.className = 'hint'

  const hintText = document.createElement('span')
  hintText.textContent = 'Click an element to assert on it'

  const doneButton = document.createElement('button')
  doneButton.textContent = 'Done (Esc)'

  hint.append(hintText, doneButton)
  layer.append(highlight, tag, hint)
  shadow.append(style, layer)
  document.documentElement.append(host)

  let panel: HTMLElement | null = null
  let hovered: Element | null = null
  // Read at the moment an assertion is chosen, so one field serves every row
  // instead of each row carrying its own.
  let readReason: () => string = () => ''

  const setHighlight = (element: Element | null) => {
    if (!element) {
      highlight.style.display = 'none'
      tag.style.display = 'none'
      return
    }

    const rect = element.getBoundingClientRect()

    highlight.style.display = 'block'
    highlight.style.left = `${rect.left}px`
    highlight.style.top = `${rect.top}px`
    highlight.style.width = `${rect.width}px`
    highlight.style.height = `${rect.height}px`

    tag.style.display = 'block'
    tag.textContent = element.tagName.toLowerCase()
    tag.style.left = `${rect.left}px`
    tag.style.top = `${Math.max(rect.top - 20, 2)}px`
  }

  const closePanel = () => {
    panel?.remove()
    panel = null
    readReason = () => ''
  }

  const flash = (message: string) => {
    hintText.textContent = message
    hint.classList.add('saved')

    setTimeout(() => {
      hintText.textContent = 'Click an element to assert on it'
      hint.classList.remove('saved')
    }, 1400)
  }

  const record = (target: ElementTarget | null, option: AssertionOption, value: string) => {
    const reason = readReason()

    handlers.onAssert(target, toDetail(option, value, reason))
    closePanel()
    setHighlight(null)
    hovered = null
    flash(reason ? `Added: ${option.label}, with reason` : `Added: ${option.label}`)
  }

  const buildRow = (
    target: ElementTarget | null,
    option: AssertionOption,
    container: HTMLElement,
  ) => {
    const row = document.createElement('div')
    row.className = 'row'

    if (!option.editable) {
      const button = document.createElement('button')
      button.className = 'add'
      button.textContent = option.label
      button.addEventListener('click', () => record(target, option, ''))
      row.append(button)
    } else {
      const input = document.createElement('input')
      input.value = option.expected ?? ''
      input.title = option.label
      input.setAttribute('aria-label', option.label)

      const save = document.createElement('button')
      save.className = 'save'
      save.textContent = option.kind === 'attribute' ? option.attribute ?? 'Set' : option.label

      const commit = () => record(target, option, input.value)

      save.addEventListener('click', commit)
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      })

      row.append(input, save)
    }

    container.append(row)
  }

  const openPanel = (element: Element) => {
    closePanel()

    const target = resolveTarget(element)

    panel = document.createElement('div')
    panel.className = 'panel'

    const header = document.createElement('header')
    const label = document.createElement('span')
    label.textContent = `${target.strategy}: ${target.value}`

    const close = document.createElement('button')
    close.textContent = 'Cancel'
    close.addEventListener('click', () => {
      closePanel()
      setHighlight(null)
      hovered = null
    })

    header.append(label, close)
    panel.append(header)

    const elementGroup = document.createElement('div')
    elementGroup.className = 'group'

    const elementTitle = document.createElement('h4')
    elementTitle.textContent = 'This element'
    elementGroup.append(elementTitle)

    for (const option of suggestAssertions(element, target)) {
      buildRow(target, option, elementGroup)
    }

    const pageGroup = document.createElement('div')
    pageGroup.className = 'group'

    const pageTitle = document.createElement('h4')
    pageTitle.textContent = 'This page'
    pageGroup.append(pageTitle)

    for (const option of pageAssertions()) {
      buildRow(null, option, pageGroup)
    }

    const reason = document.createElement('div')
    reason.className = 'reason'

    const reasonInput = document.createElement('input')
    reasonInput.placeholder = 'Failure reason (optional)'
    reasonInput.maxLength = MAX_MESSAGE_LENGTH
    reasonInput.setAttribute('aria-label', 'Failure reason')

    const note = document.createElement('div')
    note.className = 'note'
    note.textContent = 'Shown by Playwright when the assertion fails'

    reasonInput.addEventListener('input', () => {
      const armed = reasonInput.value.trim().length > 0
      reason.classList.toggle('armed', armed)
      note.textContent = armed
        ? 'Attached to the next assertion you add'
        : 'Shown by Playwright when the assertion fails'
    })

    reason.append(reasonInput, note)
    readReason = () => reasonInput.value

    panel.append(elementGroup, pageGroup, reason)
    layer.append(panel)

    const rect = element.getBoundingClientRect()
    const left = Math.min(
      Math.max(rect.left, MARGIN),
      window.innerWidth - PANEL_WIDTH - MARGIN,
    )
    const below = rect.bottom + MARGIN
    const fitsBelow = below + panel.offsetHeight < window.innerHeight

    panel.style.left = `${left}px`
    panel.style.top = fitsBelow
      ? `${below}px`
      : `${Math.max(rect.top - panel.offsetHeight - MARGIN, MARGIN)}px`
  }

  const onMouseMove = (event: MouseEvent) => {
    if (panel || isInspectorEvent(event)) {
      return
    }

    const element = elementUnder(event.clientX, event.clientY)

    if (element !== hovered) {
      hovered = element
      setHighlight(element)
    }
  }

  // Capture phase with prevention, so picking a target never triggers the page's
  // own handler or gets recorded as a click.
  const onClick = (event: MouseEvent) => {
    if (isInspectorEvent(event)) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()

    const element = elementUnder(event.clientX, event.clientY)

    if (element) {
      setHighlight(element)
      openPanel(element)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()

    if (panel) {
      closePanel()
      setHighlight(null)
      hovered = null
      return
    }

    closeInspector()
    handlers.onExit()
  }

  const onReposition = () => {
    if (!panel && hovered) {
      setHighlight(hovered)
    }
  }

  doneButton.addEventListener('click', () => {
    closeInspector()
    handlers.onExit()
  })

  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('resize', onReposition, true)

  cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition, true)
  }
}

export function closeInspector(): void {
  cleanup?.()
  cleanup = null
  host?.remove()
  host = null
}
