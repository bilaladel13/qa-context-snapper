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
| `npm run verify`          | Build, then run every verifier below                |
| `npm run verify:build`    | Assert the loaders point at the right chunks        |
| `npm run verify:bridge`   | Prove the MAIN world console bridge still serializes |
| `npm run verify:locator`  | Run locator resolution against a jsdom page         |
| `npm run verify:jira`     | Validate the generated Atlassian Document Format    |
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

### Strict mode safe locators

Playwright fails a step when a locator resolves to more than one element, which
`getByTestId('delete-btn')` does the moment a table has several rows. At capture time
[locator.ts](src/content/locator.ts) queries the live DOM for each candidate and, when a locator
matches more than one element, records the target's index among the matches. The generator then
emits `.nth(2)`.

The index is stored **per strategy**, not once per element. `getByTestId('delete-btn')` might match
3 elements while `getByRole('button', { name: 'Delete' })` matches 12, and the selector preference
lets the generator switch between them later, so a single shared index would be wrong.

Counting emulates what the emitted locator will actually resolve to: substring and
case-insensitive matching for text, label, placeholder and role names, matching Playwright's
defaults, and the smallest containing element for text so a wrapping ancestor does not inflate the
count. If the emulation cannot find the target among its own matches, the index is dropped rather
than guessed, since a wrong `.nth()` is worse than a bare locator. Pages above 2500 elements skip
the text scan so a click is never delayed.

### Relative navigation

`page.goto('http://localhost:5174/dashboard')` breaks as soon as the dev server picks a different
port. With relative navigation on, only the recording's own origin becomes a path, so the script
follows `baseURL` from `playwright.config.ts`. A URL on any other origin stays absolute, because
`baseURL` cannot cover both, and the header comment names the origin to configure.

### Jira integration

Connect a Jira Cloud site in settings with a site address, account email and API token. The token is
verified against `/rest/api/3/myself` before anything is stored, so a typo fails at the point of
entry rather than when filing a ticket.

Projects are loaded from `/rest/api/3/project/search?expand=issueTypes`, which returns each
project's issue types in the same call. That matters because issue type ids are per project on team
managed sites, so a "Bug" id from one project is invalid in another. Changing the project reselects
Bug where it exists and falls back to the first available type.

The description is Atlassian Document Format, built directly from the `ContextSnapshot` in
[adf.ts](src/jira/adf.ts) rather than by converting the Markdown report. Generating both from the
same source removes a Markdown parser that would otherwise have to be kept in sync, and gives real
ADF nodes: an environment table, an ordered list of steps, and the Playwright script as a
`codeBlock` with `language: typescript` so Jira renders it with syntax highlighting.

Requests run in the service worker, not the popup. The popup is destroyed whenever it loses focus,
which would abort an in-flight request, and keeping the call in the worker means the token never
enters a page adjacent context.

Before filing, the ticket screen collects the two things a recording cannot infer: what actually went
wrong and what should have happened. Those go at the top of the description, above the captured
evidence, because the reporter's own words are what an assignee reads first. Typed line breaks become
separate ADF paragraphs, since ADF has no newline inside a paragraph and would otherwise run them
together.

Assignable users are fetched per project from `/rest/api/3/user/assignable/search`, because
assignability is a project level permission. Many projects leave assignee off the create screen,
which rejects the entire issue; when that happens the ticket is retried unassigned and the result
screen says so, since losing the assignee beats losing the report.

#### Saving to a project directory

The Save As dialog takes focus, which closes the popup, and a `blob:` URL owned by a closed popup is
revoked before Chrome can read it. Service workers have no `URL.createObjectURL` at all. So the file
content is handed to the worker, which turns it into a data URL and calls
`chrome.downloads.download({ saveAs: true })`. That opens the native dialog so the script can be
routed straight into a project's `tests/` directory instead of Downloads.

Chrome derives a download's extension from its MIME type, and on Windows it resolves that through
`HKEY_CLASSES_ROOT\MIME\Database\Content Type`. Two ways that has gone wrong here:

| Declared type              | Saved as                                          |
| -------------------------- | ------------------------------------------------- |
| `text/plain`               | `email-bug.spec.ts.txt`                            |
| `application/octet-stream` | `email-bug.spec.circ`, from an app that registered the generic type |

So the type is matched to the extension being written: `application/typescript` for scripts and
`text/markdown` for reports. Not `text/javascript`, which Chrome maps to `.js` and would append to a
`.ts` name.

Because any such mapping can be overridden by whatever the machine has registered, the name is also
asserted directly through `downloads.onDeterminingFilename`, which takes precedence over Chrome's own
derivation. That listener is scoped to downloads this extension started, by checking `byExtensionId`.
The MIME type is chosen inside the download layer rather than passed in by callers, so it cannot be
set back to a hijackable type by accident.

Filenames are editable per tab and sanitized before use: Chrome rejects absolute paths, traversal and
reserved characters, so `../../etc/passwd` becomes `passwd.spec.ts` and the extension is reapplied if
it was removed. Dismissing the dialog is treated as a choice, not an error.

#### On credential storage

`chrome.storage.local` is sandboxed to this extension, so other extensions and page scripts cannot
read it, but it is not encrypted at rest. No extension storage is. The token is therefore treated as
a revocable credential:

- stored under its own key, never inside the settings object that other code reads and writes
- never returned to the popup once saved; the UI receives only the domain, email and a boolean
- cleared from component state as soon as Jira accepts it
- only ever sent to the configured site

Revoke it from your Atlassian account if the machine is shared or lost.

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
| `downloads`                 | Open the native Save As dialog for generated files        |
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
- [x] Strict mode safe locators and relative navigation
- [x] Jira Cloud ticket creation
- [ ] Screenshot attachment
- [ ] Follow recordings across newly opened tabs

## License

MIT
