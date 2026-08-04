const HOST_ID = 'qa-context-snapper-prompt'
const MAX_LABEL_LENGTH = 120

const STYLES = `
:host { all: initial; }
.layer {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
  background: rgba(15, 23, 42, 0.35);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.card {
  width: 420px;
  max-width: calc(100vw - 32px);
  padding: 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}
.card h3 { margin: 0 0 2px; font-size: 13px; font-weight: 600; }
.card p { margin: 0 0 10px; font-size: 11px; color: #94a3b8; }
.card input {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  background: #020617;
  border: 1px solid #1e293b;
  color: #e2e8f0;
  font-size: 13px;
}
.card input:focus { border-color: #2563eb; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.actions button {
  all: unset;
  cursor: pointer;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.actions .cancel { color: #94a3b8; }
.actions .confirm { background: #2563eb; color: #fff; }
.actions .confirm[disabled] { opacity: 0.4; cursor: default; }
`

let host: HTMLElement | null = null
let cleanup: (() => void) | null = null

export function isPromptEvent(event: Event): boolean {
  if (!host) {
    return false
  }

  const path = typeof event.composedPath === 'function' ? event.composedPath() : []

  return path.includes(host)
}

export function isPromptOpen(): boolean {
  return host !== null
}

export function closeStepPrompt(): void {
  cleanup?.()
  cleanup = null
  host?.remove()
  host = null
}

// Asked for in the page rather than the popup, because opening the popup to
// name a step means leaving the flow being recorded.
export function openStepPrompt(onSubmit: (label: string) => void): void {
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

  const card = document.createElement('div')
  card.className = 'card'

  const title = document.createElement('h3')
  title.textContent = 'Name this step'

  const help = document.createElement('p')
  help.textContent = 'Everything you do next is grouped under this name.'

  const input = document.createElement('input')
  input.maxLength = MAX_LABEL_LENGTH
  input.placeholder = 'Register a member with an invalid email'
  input.setAttribute('aria-label', 'Step name')

  const actions = document.createElement('div')
  actions.className = 'actions'

  const cancel = document.createElement('button')
  cancel.className = 'cancel'
  cancel.textContent = 'Cancel'

  const confirm = document.createElement('button')
  confirm.className = 'confirm'
  confirm.textContent = 'Add step'
  confirm.disabled = true

  actions.append(cancel, confirm)
  card.append(title, help, input, actions)
  layer.append(card)
  shadow.append(style, layer)
  document.documentElement.append(host)

  const submit = () => {
    const label = input.value.trim()

    if (label) {
      closeStepPrompt()
      onSubmit(label)
    }
  }

  input.addEventListener('input', () => {
    confirm.disabled = input.value.trim().length === 0
  })

  // Capture phase so the page cannot swallow Enter or Escape first.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isPromptEvent(event)) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopImmediatePropagation()
      submit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      closeStepPrompt()
    }
  }

  confirm.addEventListener('click', submit)
  cancel.addEventListener('click', closeStepPrompt)
  layer.addEventListener('click', (event) => {
    if (event.target === layer) closeStepPrompt()
  })
  document.addEventListener('keydown', onKeyDown, true)

  cleanup = () => document.removeEventListener('keydown', onKeyDown, true)

  input.focus()
}
