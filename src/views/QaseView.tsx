import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { StepsPanel } from '@/components/StepsPanel'
import { TextInput } from '@/components/TextInput'
import { CheckIcon, ExternalIcon, JiraIcon, QaseIcon, ResetIcon } from '@/components/icons'
import { detectRunStatus, formatSuiteTitle } from '@/qase/api'
import { formatQaseCaseUrl } from '@/generator/shared'
import { DEFAULT_QASE_CREDENTIALS } from '@/qase/store'
import type { QaseRunStatus, QaseSyncDraft } from '@/qase/types'
import type { QaseController } from '@/popup/useQase'
import type { ContextSnapshot } from '@/types'

const CREATE_NEW_VALUE = 'CREATE_NEW'

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

interface QaseViewProps {
  qase: QaseController
  snapshot: ContextSnapshot | null
  onUpdateStep?: (stepId: string, patch: { customAction?: string; customExpected?: string }) => void
  onDeleteStep?: (stepId: string) => void
  onBack: () => void
  onCreateTicket?: (qaseCaseCode: string) => void
}

export function QaseView({
  qase,
  snapshot,
  onUpdateStep,
  onDeleteStep,
  onBack,
  onCreateTicket,
}: QaseViewProps) {
  const {
    connection,
    cases,
    suites,
    busy,
    error,
    synced,
    connect,
    refreshCases,
    refreshSuites,
    sync,
    dismissError,
    clearSynced,
  } = qase

  const [projectCode, setProjectCode] = useState(connection?.projectCode ?? DEFAULT_QASE_CREDENTIALS.projectCode)
  const [apiToken, setApiToken] = useState(DEFAULT_QASE_CREDENTIALS.apiToken)
  const [selectedCaseValue, setSelectedCaseValue] = useState<string>(
    snapshot?.qaseCaseId ? String(snapshot.qaseCaseId) : CREATE_NEW_VALUE,
  )
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | undefined>(
    snapshot?.qaseSuiteId ?? undefined,
  )
  const [newTitle, setNewTitle] = useState(
    snapshot?.sessionTitle ||
      (snapshot?.environment.pageTitle ? `Verify ${snapshot.environment.pageTitle}` : 'User Directory Flow'),
  )
  const [updateSteps, setUpdateSteps] = useState(true)
  const [comment, setComment] = useState('')

  // Default to first suite automatically when suites are loaded and none selected
  useEffect(() => {
    if (suites.length > 0 && selectedSuiteId === undefined) {
      setSelectedSuiteId(suites[0]?.id)
    }
  }, [suites, selectedSuiteId])

  // Auto-detect pass / fail
  const initialStatus = useMemo<QaseRunStatus>(() => {
    return snapshot ? detectRunStatus(snapshot) : 'passed'
  }, [snapshot])

  const [status, setStatus] = useState<QaseRunStatus>(initialStatus)

  useEffect(() => {
    if (snapshot?.qaseCaseId) {
      setSelectedCaseValue(String(snapshot.qaseCaseId))
    }
    if (snapshot?.qaseSuiteId) {
      setSelectedSuiteId(snapshot.qaseSuiteId)
    }
    if (snapshot) {
      setNewTitle(
        snapshot.sessionTitle ||
          (snapshot.environment.pageTitle ? `Verify ${snapshot.environment.pageTitle}` : 'User Directory Flow'),
      )
      setStatus(detectRunStatus(snapshot))
    }
  }, [snapshot])

  const handleConnect = async () => {
    if (connection) {
      await Promise.all([refreshCases(), refreshSuites()])
    } else {
      await connect(projectCode, apiToken)
    }
  }

  const handleSync = async () => {
    const isCreate = selectedCaseValue === CREATE_NEW_VALUE
    const selectedCaseId = isCreate ? undefined : Number(selectedCaseValue)
    const existingCase = cases.find((c) => c.id === selectedCaseId)

    const draft: QaseSyncDraft = {
      mode: isCreate ? 'create' : 'existing',
      caseId: selectedCaseId,
      suiteId: selectedSuiteId,
      title: isCreate ? newTitle : existingCase?.title,
      updateSteps: isCreate ? true : updateSteps,
      status,
      comment: comment.trim() || undefined,
    }

    await sync(draft)
  }

  const caseOptions = useMemo(() => {
    const code = connection?.projectCode || projectCode || 'SQA'
    return [
      { value: CREATE_NEW_VALUE, label: '+ Create New Test Case' },
      ...cases.map((c) => ({
        value: String(c.id),
        label: `[${code}-${c.id}] ${c.title}`,
      })),
    ]
  }, [cases, connection?.projectCode, projectCode])

  const suiteOptions = useMemo(() => {
    return suites
      .map((s) => ({
        value: String(s.id),
        label: formatSuiteTitle(s, suites),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [suites])

  // Dedicated Success Confirmation View matching JiraView UX
  if (synced) {
    const code = connection?.projectCode || projectCode || 'SQA'
    const qaseUrl = formatQaseCaseUrl(code, synced.caseId, selectedSuiteId)
    const suite = suites.find((s) => s.id === selectedSuiteId)
    const suiteName = suite ? formatSuiteTitle(suite, suites) : null

    return (
      <div className="flex h-full flex-col">
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-white shadow-sm">
            <CheckIcon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Synced Successfully to Qase</p>
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="rounded bg-brand/10 border border-brand/20 px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                {synced.caseCode}
              </span>
              <p className="text-xs font-medium text-ink max-w-[280px] truncate" title={synced.caseTitle}>
                {synced.caseTitle}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-ink-subtle mt-1">
                {suiteName && <span className="truncate max-w-[160px]">{suiteName}</span>}
                {suiteName && <span>•</span>}
                <span
                  className={`font-semibold capitalize ${
                    synced.status === 'passed' ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {synced.status}
                </span>
              </div>
            </div>
          </div>

          {synced.warning ? (
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
              {synced.warning}
            </p>
          ) : null}

          <div className="flex w-full flex-col gap-2 pt-2">
            <Button
              onClick={() => void chrome.tabs.create({ url: qaseUrl })}
              icon={<ExternalIcon className="size-3.5" />}
              className="w-full justify-center"
            >
              Open Test Case in Qase
            </Button>
            {onCreateTicket && (
              <Button
                variant="ghost"
                onClick={() => onCreateTicket(synced.caseCode)}
                icon={<JiraIcon className="size-3.5" />}
                className="w-full justify-center"
              >
                Create Linked Jira Ticket
              </Button>
            )}
          </div>
        </main>

        <footer className="shrink-0 border-t border-surface-border px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                clearSynced()
                onBack()
              }}
              className="w-full py-1.5 text-xs"
            >
              Back to Results
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearSynced()
              }}
              className="w-full py-1.5 text-xs"
              icon={<ResetIcon className="size-3.5" />}
            >
              Sync Another
            </Button>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {error ? <ErrorBanner message={error} onDismiss={dismissError} /> : null}

        {/* Credentials & Workspace Group */}
        <Group title="Qase Workspace">
          <Field label="Project Code" hint="e.g. SQA" stacked>
            <TextInput
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              placeholder="SQA"
              className="uppercase"
            />
          </Field>
          <Field label="API Token" hint="From app.qase.io/user/api/token" stacked>
            <TextInput
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste Qase API token..."
            />
          </Field>
          <div className="py-2">
            <Button
              variant="ghost"
              onClick={handleConnect}
              disabled={busy}
              className="w-full text-xs"
            >
              {connection ? 'Refresh Cases' : 'Connect to Qase'}
            </Button>
          </div>
        </Group>

        {/* Target Case & Workflow Selection */}
        <Group title="Target Test Case">
          <Field label="Target Case" hint="Select an existing case or create new" stacked>
            <Select
              value={selectedCaseValue}
              onChange={(e) => setSelectedCaseValue(e.target.value)}
              options={caseOptions}
            />
          </Field>

          {suites.length > 0 ? (
            <Field label="Suite (Folder)" hint="Organize into repository test suite" stacked>
              <Select
                value={selectedSuiteId !== undefined ? String(selectedSuiteId) : ''}
                onChange={(e) => setSelectedSuiteId(e.target.value ? Number(e.target.value) : undefined)}
                options={suiteOptions}
              />
            </Field>
          ) : null}

          {selectedCaseValue === CREATE_NEW_VALUE ? (
            <Field label="New Case Title" hint="Pre-filled from session context" stacked>
              <TextInput
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Valid employee creation with proper email format"
              />
            </Field>
          ) : (
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="update-steps-toggle" className="text-xs text-ink cursor-pointer pr-2">
                Update case steps in Qase with recorded actions
              </label>
              <input
                id="update-steps-toggle"
                type="checkbox"
                checked={updateSteps}
                onChange={(e) => setUpdateSteps(e.target.checked)}
                className="size-4 shrink-0 rounded border-surface-border text-accent focus:ring-accent"
              />
            </div>
          )}
        </Group>

        {/* Test Run Execution Result */}
        <Group title="Test Run Execution">
          <Field label="Run Status" hint="Auto-detected from console and assertions" stacked>
            <div className="grid grid-cols-3 gap-1 pt-1">
              <button
                type="button"
                onClick={() => setStatus('passed')}
                className={`rounded border py-1.5 text-xs font-medium transition-colors ${
                  status === 'passed'
                    ? 'border-emerald-600 bg-emerald-500/15 text-emerald-400 font-semibold'
                    : 'border-surface-border bg-surface-base text-ink-subtle hover:text-ink'
                }`}
              >
                Pass
              </button>
              <button
                type="button"
                onClick={() => setStatus('failed')}
                className={`rounded border py-1.5 text-xs font-medium transition-colors ${
                  status === 'failed'
                    ? 'border-rose-600 bg-rose-500/15 text-rose-400 font-semibold'
                    : 'border-surface-border bg-surface-base text-ink-subtle hover:text-ink'
                }`}
              >
                Fail
              </button>
              <button
                type="button"
                onClick={() => setStatus('blocked')}
                className={`rounded border py-1.5 text-xs font-medium transition-colors ${
                  status === 'blocked'
                    ? 'border-amber-600 bg-amber-500/15 text-amber-400 font-semibold'
                    : 'border-surface-border bg-surface-base text-ink-subtle hover:text-ink'
                }`}
              >
                Blocked
              </button>
            </div>
          </Field>
          <Field label="Result Comment" hint="Optional execution note for Test Run" stacked>
            <TextInput
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional execution note for Test Run..."
            />
          </Field>
        </Group>

        {snapshot && snapshot.interactions.length > 0 ? (
          <Group title={`Test Steps to Sync (${snapshot.interactions.length})`}>
            <div className="py-2">
              <StepsPanel
                steps={snapshot.interactions}
                onUpdateStep={onUpdateStep}
                onDeleteStep={onDeleteStep}
              />
            </div>
          </Group>
        ) : null}
      </main>

      <footer className="shrink-0 space-y-2 border-t border-surface-border px-4 py-3">
        <Button
          onClick={handleSync}
          disabled={busy || !snapshot}
          className="w-full"
          icon={<QaseIcon className="size-3.5" />}
        >
          {busy ? 'Syncing to Qase...' : 'Sync to Qase'}
        </Button>
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={busy}
          className="w-full py-2 text-xs"
        >
          Back to Results
        </Button>
      </footer>
    </div>
  )
}
