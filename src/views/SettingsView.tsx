import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { SegmentedControl } from '@/components/SegmentedControl'
import { TextInput } from '@/components/TextInput'
import { Toggle } from '@/components/Toggle'
import { MonitorIcon, MoonIcon, ResetIcon, SunIcon } from '@/components/icons'
import { JiraConnectionCard } from '@/components/JiraConnectionCard'
import { ENV_VAR_PATTERN } from '@/settings/schema'
import type { Settings } from '@/settings/schema'
import type { JiraController } from '@/popup/useJira'
import type { SettingsController } from '@/popup/useSettings'

interface GroupProps {
  title: string
  children: ReactNode
}

function Group({ title, children }: GroupProps) {
  return (
    <section>
      <h2 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
        {title}
      </h2>
      <div className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface-raised px-3">
        {children}
      </div>
    </section>
  )
}

interface SettingsViewProps {
  controller: SettingsController
  jira: JiraController
  shortcut: string | null
  onOpenShortcuts: () => void
}

export function SettingsView({ controller, jira, shortcut, onOpenShortcuts }: SettingsViewProps) {
  const { settings, update, reset } = controller

  const setPlaywright = (patch: Partial<Settings['playwright']>) =>
    update((current) => ({ ...current, playwright: { ...current.playwright, ...patch } }))

  const setCapture = (patch: Partial<Settings['capture']>) =>
    update((current) => ({ ...current, capture: { ...current.capture, ...patch } }))

  const secretValid = ENV_VAR_PATTERN.test(settings.playwright.secretEnvVar)

  return (
    <>
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <Group title="Appearance">
          <Field label="Theme" hint="Follow the operating system setting, or pin the popup to light or dark.">
            <SegmentedControl
              label="Theme"
              value={settings.theme}
              onChange={(theme) => update((current) => ({ ...current, theme }))}
              options={[
                { value: 'system', label: 'Auto', icon: <MonitorIcon className="size-3" /> },
                { value: 'light', label: 'Light', icon: <SunIcon className="size-3" /> },
                { value: 'dark', label: 'Dark', icon: <MoonIcon className="size-3" /> },
              ]}
            />
          </Field>
        </Group>

        <Group title="Playwright output">
          <Field
            label="Test title"
            hint="The string passed to test(). Use the ticket id to make the generated file easy to trace."
            htmlFor="test-title"
            stacked
          >
            <TextInput
              id="test-title"
              value={settings.playwright.testTitle}
              onChange={(event) => setPlaywright({ testTitle: event.target.value })}
              placeholder="Bug Reproduction"
            />
          </Field>

          <Field
            label="Structure"
            hint="Grouped wraps each named phase in test.step(), which the Playwright report shows as collapsible groups and names in a failure, so a red run says which phase broke rather than which line. Phases come from the names you give while recording; without any it falls back to the pages you moved through, and a single group is emitted flat rather than as an empty wrapper."
            stacked
          >
            <SegmentedControl
              full
              label="Structure"
              value={settings.playwright.structure}
              onChange={(structure) => setPlaywright({ structure })}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'steps', label: 'Grouped' },
              ]}
            />
          </Field>

          <Field
            label="Selectors"
            hint="Auto picks the most resilient locator available per element. The others force one strategy, falling back only when an element cannot supply it. Changing this regenerates the script from the same recording."
            stacked
          >
            <SegmentedControl
              full
              label="Selector preference"
              value={settings.playwright.selectorPreference}
              onChange={(selectorPreference) => setPlaywright({ selectorPreference })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'testId', label: 'Test id' },
                { value: 'role', label: 'Role' },
                { value: 'css', label: 'CSS' },
              ]}
            />
          </Field>

          <Field label="Quotes" hint="Match your project's Prettier or ESLint quote style so the generated file needs no reformatting." stacked>
            <SegmentedControl
              full
              label="Quote style"
              value={settings.playwright.quoteStyle}
              onChange={(quoteStyle) => setPlaywright({ quoteStyle })}
              options={[
                { value: 'single', label: "Single '" },
                { value: 'double', label: 'Double "' },
              ]}
            />
          </Field>

          <Field label="Header comment" hint="Adds the capture date, browser and OS above the imports.">
            <Toggle
              label="Header comment"
              checked={settings.playwright.includeHeader}
              onChange={(includeHeader) => setPlaywright({ includeHeader })}
            />
          </Field>

          <Field label="Inline comments" hint="Adds notes for redacted values, submitted forms and the console assertion.">
            <Toggle
              label="Inline comments"
              checked={settings.playwright.includeComments}
              onChange={(includeComments) => setPlaywright({ includeComments })}
            />
          </Field>

          <Field label="Set viewport" hint="Emits setViewportSize using the viewport recorded during capture, so layout bugs reproduce at the same size.">
            <Toggle
              label="Set viewport"
              checked={settings.playwright.setViewport}
              onChange={(setViewport) => setPlaywright({ setViewport })}
            />
          </Field>

          <Field label="Console assertion" hint="Collects console and pageerror output during the run and asserts it stayed empty, so the test fails while the bug is present.">
            <Toggle
              label="Console assertion"
              checked={settings.playwright.includeConsoleAssertion}
              onChange={(includeConsoleAssertion) => setPlaywright({ includeConsoleAssertion })}
            />
          </Field>

          <Field label="Relative navigation" hint="Emits page.goto('/dashboard') instead of the recorded host and port, so the test follows baseURL in playwright.config.ts. A dev server on a different port then still works. URLs on other origins stay absolute.">
            <Toggle
              label="Relative navigation"
              checked={settings.playwright.useRelativeUrls}
              onChange={(useRelativeUrls) => setPlaywright({ useRelativeUrls })}
            />
          </Field>

          <Field
            label="Secret variable"
            hint="Redacted field values are emitted as process.env.NAME instead of the captured text, so the script runs without embedding a credential."
            htmlFor="secret-var"
            stacked
          >
            <TextInput
              id="secret-var"
              mono
              invalid={!secretValid}
              value={settings.playwright.secretEnvVar}
              onChange={(event) => setPlaywright({ secretEnvVar: event.target.value.toUpperCase() })}
              placeholder="QA_SNAPPER_SECRET"
            />
            {secretValid ? null : (
              <p className="text-[10px] text-danger-ink">
                Use uppercase letters, digits and underscores only.
              </p>
            )}
          </Field>
        </Group>

        <Group title="Capture">
          <Field label="Mask sensitive fields" hint="Records passwords, one time codes and card fields as [redacted]. Turn this off only on throwaway test data.">
            <Toggle
              label="Mask sensitive fields"
              checked={settings.capture.maskSensitive}
              onChange={(maskSensitive) => setCapture({ maskSensitive })}
            />
          </Field>

          <Field label="Record Enter and Escape" hint="Captures those two keys as press() actions. Other keystrokes are already covered by the field value.">
            <Toggle
              label="Record Enter and Escape"
              checked={settings.capture.trackKeyboard}
              onChange={(trackKeyboard) => setCapture({ trackKeyboard })}
            />
          </Field>

          <Field
            label="Test id attributes"
            hint="Attributes searched, in order, when building a getByTestId locator. Add your team's convention here."
            htmlFor="test-ids"
            stacked
          >
            <TextInput
              id="test-ids"
              mono
              value={settings.capture.testIdAttributes}
              onChange={(event) => setCapture({ testIdAttributes: event.target.value })}
              placeholder="data-testid, data-qa"
            />
          </Field>
        </Group>

        <section>
          <h2 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Jira
          </h2>
          <JiraConnectionCard jira={jira} />
        </section>

        {jira.connection ? (
          <Group title="Jira ticket contents">
            <Field label="Attach Playwright script" hint="Adds the generated test as a syntax highlighted code block in the ticket description.">
              <Toggle
                label="Attach Playwright script"
                checked={settings.jira.includePlaywrightScript}
                onChange={(includePlaywrightScript) =>
                  update((current) => ({
                    ...current,
                    jira: { ...current.jira, includePlaywrightScript },
                  }))
                }
              />
            </Field>

            <Field label="Attach console errors" hint="Adds the captured console output. Turn off if your reports should not contain stack traces.">
              <Toggle
                label="Attach console errors"
                checked={settings.jira.includeConsoleErrors}
                onChange={(includeConsoleErrors) =>
                  update((current) => ({
                    ...current,
                    jira: { ...current.jira, includeConsoleErrors },
                  }))
                }
              />
            </Field>
          </Group>
        ) : null}

        <Group title="Shortcut">
          <Field label="Toggle recording" hint="Starts or stops a recording without opening the popup. Chrome manages the key binding.">
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="rounded border border-surface-border px-2 py-1 font-mono text-[11px] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {shortcut ?? 'Not set'}
            </button>
          </Field>
        </Group>
      </main>

      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button
          variant="ghost"
          onClick={reset}
          className="w-full py-2 text-xs"
          icon={<ResetIcon className="size-3.5" />}
        >
          Restore defaults
        </Button>
      </footer>
    </>
  )
}
