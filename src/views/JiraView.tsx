import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { Textarea } from '@/components/Textarea'
import { TextInput } from '@/components/TextInput'
import { CheckIcon, ExternalIcon, ResetIcon } from '@/components/icons'
import { suggestSummary } from '@/jira/adf'
import type { JiraController } from '@/popup/useJira'
import type { SettingsController } from '@/popup/useSettings'
import { ScreenshotField } from '@/components/ScreenshotField'
import { useScreenshot } from '@/popup/useScreenshot'
import type { ContextSnapshot, ScreenshotMeta } from '@/types'

const SUMMARY_LIMIT = 255
const UNASSIGNED = ''

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

interface JiraViewProps {
  jira: JiraController
  settings: SettingsController
  snapshot: ContextSnapshot | null
  screenshot: ScreenshotMeta | null
  screenshotError: string | null
  onOpenSettings: () => void
}

export function JiraView({
  jira,
  settings,
  snapshot,
  screenshot,
  screenshotError,
  onOpenSettings,
}: JiraViewProps) {
  const { projects, assignees, connection, busy, error, created } = jira
  const selection = settings.settings.jira

  const [summary, setSummary] = useState('')
  const [actual, setActual] = useState('')
  const [expected, setExpected] = useState('')
  const [projectKey, setProjectKey] = useState(selection.projectKey)
  const [issueTypeId, setIssueTypeId] = useState(selection.issueTypeId)
  const [assigneeAccountId, setAssigneeAccountId] = useState(UNASSIGNED)
  const [attachScreenshot, setAttachScreenshot] = useState(true)
  const screenshotData = useScreenshot(screenshot !== null)

  useEffect(() => {
    if (snapshot) {
      setSummary(suggestSummary(snapshot))
    }
  }, [snapshot])

  const project = useMemo(
    () => projects.find((entry) => entry.key === projectKey) ?? null,
    [projects, projectKey],
  )

  // Issue type ids differ per project on team managed sites, so a remembered id
  // is only valid while its project is still selected.
  useEffect(() => {
    if (!project) {
      return
    }

    const stillValid = project.issueTypes.some((type) => type.id === issueTypeId)

    if (!stillValid) {
      const preferred =
        project.issueTypes.find((type) => /^bug$/i.test(type.name)) ?? project.issueTypes[0]

      setIssueTypeId(preferred?.id ?? '')
    }
  }, [project, issueTypeId])

  // Assignable users are per project, so the list and any selection reset with it.
  useEffect(() => {
    setAssigneeAccountId(UNASSIGNED)
    jira.loadAssignees(projectKey)
  }, [projectKey, jira.loadAssignees])

  const remember = (key: string, id: string) => {
    const nextProject = projects.find((entry) => entry.key === key)
    const nextType = nextProject?.issueTypes.find((entry) => entry.id === id)

    settings.update((current) => ({
      ...current,
      jira: {
        ...current.jira,
        projectKey: key,
        projectName: nextProject?.name ?? '',
        issueTypeId: id,
        issueTypeName: nextType?.name ?? '',
      },
    }))
  }

  const submit = async () => {
    const success = await jira.createIssue({
      summary,
      projectKey,
      issueTypeId,
      assigneeAccountId: assigneeAccountId || null,
      actual,
      expected,
      attachScreenshot: attachScreenshot && screenshot !== null,
    })

    if (success) {
      remember(projectKey, issueTypeId)
    }
  }

  if (created) {
    return (
      <>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent-strong text-on-accent">
            <CheckIcon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Ticket created</p>
            <p className="mt-1 font-mono text-xs text-ink-muted">{created.key}</p>
          </div>

          {created.warning ? (
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
              {created.warning}
            </p>
          ) : null}

          <Button
            onClick={() => void chrome.tabs.create({ url: created.url })}
            icon={<ExternalIcon className="size-3.5" />}
          >
            Open in Jira
          </Button>
        </main>

        <footer className="shrink-0 border-t border-surface-border px-4 py-3">
          <Button variant="ghost" onClick={jira.clearCreated} className="w-full py-2 text-xs">
            Create another
          </Button>
        </footer>
      </>
    )
  }

  if (!connection) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-ink">Jira is not connected</p>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Add a site address, account email and API token in settings to create tickets from a
          recording.
        </p>
        <Button onClick={onOpenSettings}>Open settings</Button>
      </main>
    )
  }

  const canSubmit = Boolean(summary.trim() && projectKey && issueTypeId && snapshot) && !busy

  return (
    <>
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {error ? <ErrorBanner message={error} onDismiss={jira.dismissError} /> : null}

        {snapshot === null ? (
          <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
            There is no recording to attach yet. Record a session first.
          </p>
        ) : null}

        <Group title="Report">
          <Field
            label="Summary"
            hint="The ticket title. Prefilled from the page title and the first console error."
            htmlFor="jira-summary"
            stacked
          >
            <TextInput
              id="jira-summary"
              value={summary}
              maxLength={SUMMARY_LIMIT}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Short description of the bug"
            />
          </Field>

          <Field
            label="Actual behaviour"
            hint="What actually went wrong, in your own words. Appears at the top of the ticket, above the captured evidence. Each line becomes its own paragraph."
            htmlFor="jira-actual"
            stacked
          >
            <Textarea
              id="jira-actual"
              value={actual}
              onChange={(event) => setActual(event.target.value)}
              placeholder="The order total showed as NaN after removing the last item."
            />
          </Field>

          <Field
            label="Expected result"
            hint="What should have happened instead. Gives the assignee the acceptance criterion to fix against."
            htmlFor="jira-expected"
            stacked
          >
            <Textarea
              id="jira-expected"
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="The total should fall back to 0.00 when the basket is empty."
            />
          </Field>
        </Group>

        <Group title="Visual context">
          <ScreenshotField
            meta={screenshot}
            error={screenshotError}
            dataUrl={screenshotData}
            attach={attachScreenshot}
            onChange={setAttachScreenshot}
          />
        </Group>

        <Group title="Destination">
          <Field
            label="Project"
            hint="Loaded from your Jira site. Only projects this account can see are listed."
            htmlFor="jira-project"
            stacked
          >
            <Select
              id="jira-project"
              value={projectKey}
              placeholder="Choose a project"
              options={projects.map((entry) => ({
                value: entry.key,
                label: `${entry.name} (${entry.key})`,
              }))}
              onChange={(event) => setProjectKey(event.target.value)}
            />
          </Field>

          <Field
            label="Issue type"
            hint="Types available in the chosen project. Bug is selected when the project has one."
            htmlFor="jira-type"
            stacked
          >
            <Select
              id="jira-type"
              value={issueTypeId}
              disabled={!project}
              placeholder="Choose an issue type"
              options={(project?.issueTypes ?? []).map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              onChange={(event) => setIssueTypeId(event.target.value)}
            />
          </Field>

          <Field
            label="Assignee"
            hint="Users Jira reports as assignable on this project. Leave unassigned to let the team triage it. Some projects do not allow an assignee on create, in which case the ticket is filed unassigned and says so."
            htmlFor="jira-assignee"
            stacked
          >
            <Select
              id="jira-assignee"
              value={assigneeAccountId}
              disabled={!project || jira.loadingAssignees}
              options={[
                { value: UNASSIGNED, label: jira.loadingAssignees ? 'Loading users' : 'Unassigned' },
                ...assignees.map((user) => ({
                  value: user.accountId,
                  label: user.emailAddress
                    ? `${user.displayName} (${user.emailAddress})`
                    : user.displayName,
                })),
              ]}
              onChange={(event) => setAssigneeAccountId(event.target.value)}
            />
          </Field>
        </Group>

        <div className="flex items-center justify-between gap-2 px-1">
          <p className="truncate text-[10px] text-ink-subtle">
            {connection.accountName ?? connection.email} at{' '}
            {connection.domain.replace(/^https:\/\//, '')}
          </p>
          <button
            type="button"
            onClick={() => void jira.refreshProjects()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1 text-[10px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            <ResetIcon className="size-3" />
            Refresh
          </button>
        </div>
      </main>

      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button onClick={() => void submit()} disabled={!canSubmit} className="w-full">
          {busy ? 'Creating' : 'Create Jira Ticket'}
        </Button>
      </footer>
    </>
  )
}
