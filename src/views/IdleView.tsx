import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { EnvironmentPanel } from '@/components/EnvironmentPanel'
import { QaseIcon, RecordIcon } from '@/components/icons'
import { formatSuiteTitle } from '@/qase/api'
import type { EnvironmentState } from '@/popup/useEnvironment'
import type { QaseController } from '@/popup/useQase'

interface IdleViewProps {
  environment: EnvironmentState
  pending: boolean
  shortcut: string | null
  qase: QaseController
  onStart: (qaseContext?: {
    projectCode?: string
    suiteId?: number | null
    caseId?: number | null
    caseTitle?: string | null
  }) => void
  onLoadDemo?: () => void
}

export function IdleView({
  environment,
  pending,
  shortcut,
  qase,
  onStart,
  onLoadDemo,
}: IdleViewProps) {
  const blocked = environment.tab?.recordable === false
  const reason = environment.tab?.blockedReason

  const [projectCode, setProjectCode] = useState<string>(
    qase.connection?.projectCode || 'SQA',
  )
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | undefined>(undefined)
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [isNewProjectMode, setIsNewProjectMode] = useState(false)
  const [newProjectInput, setNewProjectInput] = useState('')

  useEffect(() => {
    if (qase.connection?.projectCode) {
      setProjectCode(qase.connection.projectCode)
    }
  }, [qase.connection?.projectCode])

  useEffect(() => {
    if (qase.suites.length > 0 && selectedSuiteId === undefined) {
      setSelectedSuiteId(qase.suites[0]?.id)
    }
  }, [qase.suites, selectedSuiteId])

  const projects = useMemo(() => {
    if (qase.projects.length > 0) {
      return qase.projects
    }
    return [{ code: projectCode || 'SQA', title: 'Main Project' }]
  }, [qase.projects, projectCode])

  const handleProjectSelect = (code: string) => {
    if (code === '__NEW__') {
      setIsNewProjectMode(true)
      return
    }
    setProjectCode(code)
    setSelectedCaseId('')
    void qase.refreshCases(code)
    void qase.refreshSuites(code)
  }

  const handleApplyNewProject = () => {
    const trimmed = newProjectInput.trim().toUpperCase()
    if (!trimmed) return
    setProjectCode(trimmed)
    setIsNewProjectMode(false)
    setNewProjectInput('')
    setSelectedCaseId('')
    void qase.refreshCases(trimmed)
    void qase.refreshSuites(trimmed)
  }

  const filteredCases = useMemo(() => {
    if (!searchFilter.trim()) return qase.cases
    const q = searchFilter.toLowerCase()
    return qase.cases.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        String(c.id).includes(q) ||
        `${projectCode}-${c.id}`.toLowerCase().includes(q),
    )
  }, [qase.cases, searchFilter, projectCode])

  const selectedCase = useMemo(() => {
    if (!selectedCaseId) return null
    return qase.cases.find((c) => String(c.id) === selectedCaseId) || null
  }, [qase.cases, selectedCaseId])

  const suiteName = useMemo(() => {
    if (selectedCase?.suite_id != null) {
      const suite = qase.suites.find((s) => s.id === selectedCase.suite_id)
      return suite ? formatSuiteTitle(suite, qase.suites) : null
    }
    if (selectedSuiteId != null) {
      const suite = qase.suites.find((s) => s.id === selectedSuiteId)
      return suite ? formatSuiteTitle(suite, qase.suites) : null
    }
    return null
  }, [selectedCase, selectedSuiteId, qase.suites])

  const handleStart = () => {
    onStart({
      projectCode,
      suiteId: selectedCase?.suite_id ?? selectedSuiteId ?? null,
      caseId: selectedCase ? selectedCase.id : null,
      caseTitle: selectedCase ? selectedCase.title : null,
    })
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          <EnvironmentPanel environment={environment.environment} loading={environment.loading} />

          {/* Qase Context Bar */}
          <div className="rounded-lg border border-surface-border bg-surface-raised p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <QaseIcon className="size-3.5 text-brand" />
                <span>Qase Target</span>
              </div>

              {isNewProjectMode ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newProjectInput}
                    onChange={(e) => setNewProjectInput(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="w-16 rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[11px] font-mono uppercase text-ink"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleApplyNewProject}
                    className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-accent-hover"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewProjectMode(false)}
                    className="text-[10px] text-ink-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-ink-subtle">Project:</span>
                  <select
                    value={projectCode}
                    onChange={(e) => handleProjectSelect(e.target.value)}
                    className="rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                  >
                    {projects.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code}
                      </option>
                    ))}
                    <option value="__NEW__">+ New Project</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search test cases by title or ID..."
                className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-[11px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand"
              />
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full truncate rounded border border-surface-border bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-brand"
              >
                <option value="">+ New Test Case / Exploratory</option>
                {filteredCases.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    [{projectCode}-{c.id}] {c.title}
                  </option>
                ))}
              </select>

              {selectedCaseId === '' ? (
                qase.suites.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-ink-subtle shrink-0">Suite:</span>
                    <select
                      value={selectedSuiteId ?? ''}
                      onChange={(e) =>
                        setSelectedSuiteId(e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full truncate rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[11px] text-ink"
                    >
                      {qase.suites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatSuiteTitle(s, qase.suites)}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between text-[10px] text-ink-muted px-0.5 pt-0.5">
                  <span className="font-mono text-brand font-semibold">
                    {projectCode}-{selectedCase?.id}
                  </span>
                  {suiteName && (
                    <span className="truncate max-w-[180px] text-ink-subtle" title={suiteName}>
                      {suiteName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {blocked && reason ? (
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
              {reason}
            </p>
          ) : (
            <ol className="space-y-1.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              <li>1. Start recording, then reproduce the bug on the page.</li>
              <li>2. Interactions and console errors are captured as you go.</li>
              <li>3. Stop to generate a bug report and a Playwright script.</li>
            </ol>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button
          onClick={handleStart}
          disabled={pending || blocked}
          className="w-full"
          icon={<RecordIcon className="size-3.5" />}
        >
          {pending
            ? 'Starting'
            : selectedCase
              ? `Record for [${projectCode}-${selectedCase.id}]`
              : 'Start Recording'}
        </Button>
        {onLoadDemo ? (
          <Button
            variant="ghost"
            onClick={onLoadDemo}
            disabled={pending}
            className="w-full mt-2 py-1.5 text-xs text-ink-muted"
          >
            Load Sample Recording
          </Button>
        ) : null}
        {shortcut ? (
          <p className="mt-2 text-center text-[10px] text-ink-subtle">
            Shortcut <span className="font-mono text-ink-muted">{shortcut}</span>
          </p>
        ) : null}
      </footer>
    </>
  )
}
