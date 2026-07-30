# QA Context Snapper

A Chrome extension (Manifest V3) for QA engineers. It captures the browser environment, the last UI
interactions and recent console errors from the page under test, then generates a Markdown bug
report together with a boilerplate Playwright E2E test script.

Status: scaffold. The popup shell is in place; capture and generation logic are not implemented yet.

## Stack

| Concern    | Choice                          |
| ---------- | ------------------------------- |
| Bundler    | Vite 8 + `@crxjs/vite-plugin` 2 |
| UI         | React 19 + TypeScript 5         |
| Styling    | Tailwind CSS v4 (`@theme`)      |
| Extension  | Manifest V3, module service worker |

Tailwind v4 is configured through the `@tailwindcss/vite` plugin, so there is no
`tailwind.config.js`. Design tokens live in the `@theme` block of
[globals.css](src/styles/globals.css).

## Getting started

```bash
npm install
npm run build
```

### Load the unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the generated `dist/` folder.
4. Pin "QA Context Snapper" and open the popup.

### Development loop

```bash
npm run build:watch
```

This rebuilds `dist/` on every change. Press the reload button on the extension card in
`chrome://extensions` to pick up a rebuild, and reload the page under test so the new content script
is injected.

Do not load `dist/` while `npm run dev` is running. The dev server writes a service worker that
imports the Vite dev client over http://localhost:5173, and that client expects a DOM:

```js
import 'http://localhost:5173/@vite/env';
import 'http://localhost:5173/@crx/client-worker';
```

An MV3 service worker has no `window`, so the worker dies on load with
`Uncaught ReferenceError: window is not defined` and nothing responds to the popup.

### Entry points must have distinct filenames

The background and content entries are `service-worker.ts` and `content-script.ts` rather than both
being `index.ts`. CRXJS derives generated chunk names from the entry basename, so two entries named
`index.ts` produce colliding names and `service-worker-loader.js` ends up importing the content
script chunk. The symptom is the same `window is not defined`, this time from a production build,
because the worker is executing DOM code. `npm run verify:build` asserts the wiring.

## Scripts

| Script                    | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Vite dev server with extension HMR                  |
| `npm run build`           | Type check, then production build into `dist/`      |
| `npm run build:watch`     | Production build, rebuilt on change                 |
| `npm run typecheck`       | `tsc --noEmit` only                                 |
| `npm run verify`          | Build, then run both verifiers below                |
| `npm run verify:build`    | Assert the loaders point at the right chunks        |
| `npm run verify:bridge`   | Prove the MAIN world console bridge still serializes |
| `npm run preview:report`  | Render a sample report and syntax-check the script  |
| `npm run zip`             | Build and package `dist/` into `release/*.zip`      |

Icons are generated rather than committed as binaries by hand:

```bash
node scripts/generate-icons.mjs
```

## Project layout

```
manifest.json              MV3 manifest, source of truth, transformed at build time
vite.config.ts             Vite, React, Tailwind and CRXJS wiring
public/icons/              Generated action icons (16/32/48/128)
scripts/                   Icon generator and release packaging
src/
  popup/
    index.html             Popup entry, referenced by manifest action.default_popup
    main.tsx               React root
    Popup.tsx              Status switch over idle, recording and result
    useRecorder.ts         Background state sync and command dispatch
    useElapsed.ts          Recording timer
  views/                   IdleView, RecordingView, ResultView
  components/              Header, Section, Button, CodeBlock, ErrorBanner, panels
  messaging/
    protocol.ts            Message unions, Result type and type guards
    client.ts              Typed senders that convert throws into Result
  background/
    service-worker.ts      Message listener, command handlers, report generation
    store.ts               Serialized session storage for state and buffer
    tabs.ts                Tab resolution, content script and bridge injection
  content/
    content-script.ts      Capture listeners, streams events to the background
    locator.ts             Element to structured target resolution
    main-world-bridge.ts   Console patch injected into the page realm
  settings/                Preference schema, validation and storage
  shared/environment.ts    Browser detection usable from popup or page
  generator/
    generateMarkdownReport.ts
    generatePlaywrightScript.ts
    shared.ts              Quoting, step descriptions, viewport parsing
  styles/globals.css       Tailwind import and design tokens
  types/index.ts           Shared snapshot, report and recorder state types
```

## Recording architecture

The popup is not a reliable place to hold state: Chrome unmounts it every time it loses focus. The
background service worker owns the recorder state instead, and the popup is a thin renderer that
reads it on mount and re-renders on a `STATE_CHANGED` broadcast. Because MV3 service workers are
themselves terminated when idle, the state is persisted to `chrome.storage.session` on every write.

The content script holds no buffer. It streams every interaction and console error to the background
as it happens, and the background is the accumulator. That is what makes a recording survive a full
page navigation: the new document's content script sends `CONTENT_HELLO`, the background recognises
the tab as the one being recorded, re-injects the console bridge and replies with the session id, and
capture resumes against the same buffer.

```
Popup            Background                       Content script
  START_RECORDING ->
                   resolve tab, inject bridge
                                    CONTENT_START_RECORDING ->
                   buffer = []
  <- RecorderState
                              <- RECORD_INTERACTION / RECORD_CONSOLE_ERROR
                   append, broadcast counts
                                                  (page navigates)
                              <- CONTENT_HELLO
                   re-inject bridge, resume ->
  STOP_RECORDING  ->
                                    CONTENT_STOP_RECORDING ->
                   read buffer, generate report
  <- RecorderState with snapshot and report
```

Every request resolves to a `Result<RecorderState>`, so a failure such as an unrecordable page
surfaces in the popup as a message rather than an unhandled rejection.

Each of those appends is a read-modify-write against `chrome.storage.session`, and the service
worker interleaves async handlers freely, so concurrent events would silently lose each other's
writes. [store.ts](src/background/store.ts) funnels every mutation through a single promise chain.

### Why console capture needs a MAIN world bridge

Content scripts run in an isolated world with their own `window` and their own `console`. Patching
`console.error` there intercepts nothing the page logs, and `unhandledrejection` never fires because
that event is bound to the realm owning the promise.

So the interception lives in [main-world-bridge.ts](src/content/main-world-bridge.ts), injected by
the background with `chrome.scripting.executeScript({ world: 'MAIN' })` when recording starts. That
route bypasses page CSP, which a `<script>` tag would not. The bridge patches `console.error` and
`console.warn`, listens for `error` and `unhandledrejection`, and relays entries to the isolated
content script over `window.postMessage`. It always calls through to the original console, restores
it on stop only if nothing else has patched it since, and is a no-op until a session is active.

Because `executeScript` serializes the function with `toString()`, that file must stay free of
imports and outer-scope references. `scripts/verify-bridge.mjs` re-parses it out of the production
bundle and exercises it to prove that holds.

### Selector strategy

[locator.ts](src/content/locator.ts) resolves each element to a structured target, in the order a
Playwright locator would prefer:

1. `data-testid`, `data-test-id`, `data-test`, `data-qa`, `data-cy`
2. ARIA role plus accessible name, with implicit roles derived from the tag and input type
3. Associated `<label>` text
4. `placeholder`
5. Visible text
6. A generated CSS path, narrowed with stable classes and `:nth-of-type` until it is unique

Classes and ids that look generated (four or more consecutive digits, hash-like suffixes) are
skipped so selectors survive a rebuild. Every target also carries a CSS fallback.

### Privacy

Values from `type="password"` fields, anything whose `autocomplete` mentions a password, `cc-`, or
`one-time-code`, and any element marked `data-sensitive` are recorded as `[redacted]`. Hidden inputs
are skipped entirely. Reports are meant to be pasted into tickets, so this is deliberate.

### Generated output

[generatePlaywrightScript.ts](src/generator/generatePlaywrightScript.ts) maps each structured target
onto the matching Playwright locator: `getByTestId`, `getByRole` with an accessible name,
`getByLabel`, `getByPlaceholder`, `getByText`, and `page.locator` as the fallback. Actions become
`click`, `fill`, `selectOption`, `check` / `uncheck`, `press`, or `goto`.

Two details that matter in practice. Values captured from redacted fields are emitted as
`process.env.QA_SNAPPER_SECRET` rather than the mask text, so the script is runnable without leaking
anything. And when the recording captured console errors, the test registers `console` and
`pageerror` listeners and ends with an assertion that they stayed empty, so the generated test fails
while the bug is present and passes once it is fixed.

`npm run preview:report` renders both outputs from a fixture and parses the generated script to
confirm it is syntactically valid.

### Settings and theming

Preferences live in `chrome.storage.local` ([settings/](src/settings/)) and cover appearance,
Playwright output and capture behaviour. Each control carries a `?` tooltip explaining the
trade-off rather than restating its name.

Theming uses CSS `light-dark()`: every token in [globals.css](src/styles/globals.css) carries both
values, and switching a theme only changes `color-scheme`. That means the correct palette is painted
on the first frame with no inline script, which matters because MV3's default CSP (`script-src
'self'`) blocks inline scripts outright. It is also why `minimum_chrome_version` is 123.

Free text is stored exactly as typed. Validation happens at generation time
(`resolvePlaywrightSettings`), because normalising on write rewrites a half-finished value under the
user mid-keystroke.

### Regenerating without re-recording

[locator.ts](src/content/locator.ts) records a candidate for every strategy an element supports, not
just the winning one. The generator picks from those candidates at output time, so changing the
selector preference, structure or quote style re-emits the script from the stored snapshot. The
background watches `chrome.storage.onChanged` and regenerates automatically, so the result view
updates while the settings are open.

### Known limitations

- The console bridge is re-injected after a navigation in response to `CONTENT_HELLO`, so errors
  logged in the first few milliseconds of a new document can be missed.
- Recording follows a single tab. Opening a link in a new tab stops capture at that point.

The `@` alias maps to `src/`.

## Permissions

| Permission                  | Reason                                                   |
| --------------------------- | -------------------------------------------------------- |
| `activeTab`, `tabs`         | Read the URL and title of the tab being reported on       |
| `scripting`                 | Inject the capture logic on demand                        |
| `storage`                   | Persist captured snapshots between popup openings         |
| `host_permissions: <all_urls>` | QA work targets arbitrary staging and production hosts |

## Roadmap

- [x] Project scaffold and popup shell
- [x] Record and replay state machine with popup, background and content messaging
- [x] Environment capture (browser, OS, screen and viewport, user agent)
- [x] Console error and unhandled rejection collection
- [x] Interaction recording with stable selector generation
- [x] Survive full page navigation during a recording
- [x] Markdown bug report generation
- [x] Playwright script generation
- [x] Copy to clipboard and file export
- [x] Settings engine, light and dark themes, configurable Playwright output
- [x] Keyboard shortcut and recording badge
- [ ] Screenshot attachment
- [ ] Follow recordings across newly opened tabs

## License

MIT
