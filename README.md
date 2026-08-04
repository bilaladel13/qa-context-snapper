<div align="center">

# QA Context Snapper

**Reproduce the bug once. Ship the report and the test.**

A Chrome extension that records a QA session and turns it into a Markdown bug report
and a runnable Playwright test, then files it to Jira without leaving the browser.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

</div>

---

## The problem

Filing a good bug takes longer than finding one. You reproduce it, then retype the steps, hunt for
the console error, screenshot the environment, and afterwards someone still has to write the
regression test by hand.

QA Context Snapper collapses that into: press record, reproduce the bug, press stop.

## What you get

Press stop and three artefacts exist at once, from one recording:

| Output | Detail |
| ------ | ------ |
| **Markdown bug report** | Environment table, numbered reproduction steps, console output |
| **Playwright spec** | Runnable `.spec.ts` with resilient locators and real assertions |
| **Jira ticket** | Native Atlassian Document Format, with project and assignee pickers |
| **Screenshot** | Captured the instant you stop, attached to the ticket automatically |

## Key features

- **Smart Locator Ladder** — resolves ambiguous elements by *identity*, not position. Details below.
- **Assertion inspector** — hover, click, and pick what to assert. Values are read live off the page.
- **Name phases while recording** — they become `test.step` groups, report headings and Jira sections.
- **Visual context** — a screenshot taken the moment you stop, previewed before it is attached.
- **Console capture that actually works** — including errors thrown by the page's own scripts.
- **Survives navigation** — a recording continues across full page loads and logins.
- **Relative navigation** — emits `page.goto('/checkout')` so tests follow your `baseURL`.
- **Secrets are never captured** — password and card fields record as `[redacted]`.
- **Light and dark themes**, a recording badge, and a keyboard shortcut to start and stop.

## How it works

```
        ┌──────────────┐   commands    ┌────────────────────┐
        │    Popup     │ ────────────▶ │  Service worker    │
        │  (React 19)  │ ◀──────────── │  owns all state    │
        └──────────────┘   state       └────────────────────┘
                                          ▲            │
                        events streamed   │            │ inject
                                          │            ▼
                                       ┌────────────────────┐
                                       │   Content script   │
                                       │  capture + inspect │
                                       └────────────────────┘
                                                  ▲
                                                  │ postMessage
                                       ┌────────────────────┐
                                       │  MAIN world bridge │
                                       │  console + errors  │
                                       └────────────────────┘
```

The popup holds **no** recording state. Chrome unmounts it whenever it loses focus, which is exactly
what happens when you click into the page to reproduce a bug. The service worker owns the state and
the popup is a thin renderer.

The content script holds no buffer either. It streams every event to the background as it happens,
which is why a recording survives a page navigation instead of dying with the document.

### The Smart Locator Ladder

The hard part of generated E2E tests is the locator. `.nth(2)` encodes **position**, and position is
the first thing a dynamic list breaks: add a row and index 2 is a different element. But switching
wholesale to `filter({ hasText })` trades that for a strict-mode violation the moment two rows share
a name.

So ambiguity walks a ladder, and **every rung is proven against the live DOM before it is recorded**.
Nothing is emitted that has not been shown to resolve to exactly one element:

```ts
// 1. The element's own text, when it is unique among the matches
await page.getByTestId('member-email').filter({ hasText: 'sara@example.com' }).click();

// 2. The nearest identifiable ancestor, when the element itself is anonymous.
//    Every Remove button reads the same, so identity comes from the row that owns it.
await page.getByRole('row').filter({ hasText: 'omar@example.com' }).getByTestId('remove').click();

// 3. Position, only when nothing distinguishes the element or any ancestor
await page.getByTestId('dot').nth(2).click();
```

A scope is named with `{ name }` only when that name was **authored** (`aria-label`,
`aria-labelledby`, `title`). A container's accessible name otherwise falls back to its own text
content, which for a table row is every cell joined together: brittle, and for roles that do not take
their name from content it would not match at all.

### Assertions

A test that only watches the console passes on any bug that fails silently, which is most of them.
The inspector opens in the page itself, highlights elements as you hover, and offers the assertions
that actually apply to whatever you clicked, with the expected value already read off the element:

```ts
await expect(page.getByRole('alert')).toBeVisible();
await expect(page.getByTestId('error-text')).toHaveText('Enter a valid email address');
await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
await expect(page.getByTestId('spinner'), 'the spinner must clear or the form looks stuck').toBeHidden();
```

That last one uses Playwright's custom failure message, so a red CI run months from now says *why*
the check mattered.

## Install

Requires Node 22+ and Chrome 123+.

```bash
git clone https://github.com/bilaladel13/qa-context-snapper.git
cd qa-context-snapper
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** and select the generated `dist/` folder

> **Use `npm run build:watch`, not `npm run dev`.** The dev server writes a service worker that
> imports the Vite dev client, which expects a DOM. An MV3 worker has no `window`, so it dies on
> load. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#development-loop).

## Usage

1. Open the page under test and click **Start Recording**
2. Reproduce the bug. Close the popup if you like, recording continues
3. Optionally click **Add assertion** and pick elements to check
4. **Stop and Generate**
5. Copy, **Save as** into your `tests/` folder, or **Create Jira Ticket**

## Tech stack

| Concern | Choice |
| ------- | ------ |
| Extension | Manifest V3, module service worker |
| UI | React 19, TypeScript 5 in strict mode |
| Build | Vite 8 with `@crxjs/vite-plugin` |
| Styling | Tailwind CSS v4, tokens via `@theme` and `light-dark()` |
| Storage | `chrome.storage.session` for recordings, `local` for settings |
| Integration | Jira Cloud REST v3, Atlassian Document Format |

## Verification

There is no browser test runner here. Instead each subsystem that could regress silently has a
verifier that runs against real build output or a real DOM:

```bash
npm run verify
```

| Script | Proves |
| ------ | ------ |
| `verify:build` | The worker and content loaders point at the right chunks |
| `verify:bridge` | The MAIN world console bridge still survives serialisation |
| `verify:locator` | The locator ladder resolves correctly against a jsdom page |
| `verify:assertions` | Each kind of element offers the right assertions |
| `verify:jira` | The generated Atlassian Document Format is structurally valid |
| `preview:report` | Every output option combination parses as valid JavaScript |

## Documentation

[**ARCHITECTURE.md**](docs/ARCHITECTURE.md) records why the extension is built the way it is: the
MAIN world console bridge, the serialized state store, MV3 build traps, privacy rules and the known
limitations. Every section is there because something did not work the obvious way.

## Known limitations

- A recording follows a single tab; opening a link in a new tab stops capture there.
- Console errors in the first milliseconds after a navigation can be missed while the bridge
  re-injects.
- The screenshot is only taken if the recorded tab is the one on screen when you stop. Stopping via
  the keyboard from another tab records no image rather than the wrong one.
- The screenshot is attached to the ticket rather than embedded inline in its description.

## License

MIT
