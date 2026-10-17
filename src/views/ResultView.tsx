import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Collapsible } from '@/components/Collapsible'
import { ConsoleErrorsPanel } from '@/components/ConsoleErrorsPanel'
import { NetworkPanel } from '@/components/NetworkPanel'
import { SegmentedControl } from '@/components/SegmentedControl'
import { StepsPanel } from '@/components/StepsPanel'
import { TextInput } from '@/components/TextInput'
import { CopyIcon, DownloadIcon, JiraIcon, QaseIcon, ResetIcon } from '@/components/icons'
import { formatSpecFilename } from '@/generator/shared'
import { requestDownload } from '@/messaging/client'
import type { RecorderState } from '@/types'

type PreviewTab = 'playwright' | 'markdown'

interface ResultViewProps {
  state: RecorderState
  pending: boolean
  onReset: () => void
  onCreateTicket: () => void
  onOpenQase?: () => void
  onDeleteStep?: (stepId: string) => void
  onUpdateStep?: (stepId: string, patch: { customAction?: string; customExpected?: string }) => void
  onUpdateSessionTitle?: (title: string) => void
}

export function ResultView({
  state,
  pending,
  onReset,
  onCreateTicket,
  onOpenQase,
  onDeleteStep,
  onUpdateStep,
  onUpdateSessionTitle,
}: ResultViewProps) {
  const [previewTab, setPreviewTab] = useState<PreviewTab>('playwright')
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const snapshot = state.snapshot

  const initialTitle =
    state.sessionTitle ||
    state.tabTitle ||
    snapshot?.environment.pageTitle ||
    'QA Recording Session'
  const [sessionTitle, setSessionTitle] = useState(initialTitle)

  useEffect(() => {
    if (state.sessionTitle && state.sessionTitle !== sessionTitle) {
      setSessionTitle(state.sessionTitle)
    }
  }, [state.sessionTitle])

  const qaseCaseCode = state.qaseCaseCode || snapshot?.qaseCaseCode || null

  const specFilename = useMemo(() => {
    return formatSpecFilename(sessionTitle, qaseCaseCode)
  }, [sessionTitle, qaseCaseCode])

  useEffect(() => {
    if (!exportStatus) return
    const timer = setTimeout(() => setExportStatus(null), 2500)
    return () => clearTimeout(timer)
  }, [exportStatus])

  const handleTitleChange = (next: string) => {
    setSessionTitle(next)
    if (snapshot) {
      snapshot.sessionTitle = next
      if (snapshot.environment) {
        snapshot.environment.pageTitle = next
      }
    }
    onUpdateSessionTitle?.(next)
  }

  const handleCopy = async (text: string, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setExportStatus(`Copied ${label}`)
    } catch {
      setExportStatus('Copy failed')
    }
  }

  const handleDownload = async (text: string, dlFilename: string) => {
    if (!text) return
    setExportStatus('Downloading...')
    try {
      const response = await requestDownload({
        type: 'DOWNLOAD_FILE',
        content: text,
        filename: dlFilename,
      })
      if (response.ok && !response.data.cancelled) {
        setExportStatus(`Saved ${dlFilename}`)
      } else if (!response.ok) {
        setExportStatus('Download failed')
      } else {
        setExportStatus(null)
      }
    } catch {
      setExportStatus('Download failed')
    }
  }

  const previewContent =
    previewTab === 'playwright'
      ? state.report?.playwrightScript ?? ''
      : state.report?.markdown ?? ''

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {/* 1. Editable Session Title & Linked Badge */}
        <div className="shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="session-title-input"
              className="block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
              Session Title
            </label>
            {qaseCaseCode && (
              <span className="rounded bg-brand/10 border border-brand/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-brand">
                {qaseCaseCode}
              </span>
            )}
          </div>
          <TextInput
            id="session-title-input"
            value={sessionTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="QA Recording Session"
            className="py-1 text-xs font-medium"
          />
          <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <span className="text-[10px] uppercase font-semibold text-ink-subtle">File:</span>
            <span className="font-mono text-ink-muted text-[11px]">{specFilename}</span>
          </div>
        </div>

        {/* 2. Recorded Steps List (Expanded by Default at the Top!) */}
        {snapshot === null ? (
          <p className="shrink-0 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
            No captured data is available for this recording.
          </p>
        ) : (
          <div className="shrink-0 space-y-2">
            <Collapsible title="Recorded Steps" badge={`${snapshot.interactions.length}`} defaultOpen>
              <StepsPanel
                steps={snapshot.interactions}
                onDeleteStep={onDeleteStep}
                onUpdateStep={onUpdateStep}
              />
            </Collapsible>
          </div>
        )}

        {/* 3. Primary Buttons (Sync to Qase & Jira Ticket) */}
        <div className="shrink-0 grid grid-cols-2 gap-2">
          <Button
            onClick={onOpenQase}
            disabled={pending || snapshot === null}
            className="w-full justify-center"
            icon={<QaseIcon className="size-3.5" />}
          >
            Sync to Qase
          </Button>
          <Button
            onClick={onCreateTicket}
            disabled={pending || snapshot === null}
            variant="ghost"
            className="w-full justify-center"
            icon={<JiraIcon className="size-3.5" />}
          >
            Jira Ticket
          </Button>
        </div>

        {/* 4. Streamlined 3-Button Export Bar */}
        <div className="shrink-0 space-y-1.5 rounded-lg border border-surface-border bg-surface-raised p-2.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Quick Export
            </span>
            {exportStatus ? (
              <span className="truncate text-[10px] font-medium text-brand">
                {exportStatus}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant="ghost"
              onClick={() =>
                void handleDownload(state.report?.playwrightScript ?? '', specFilename)
              }
              disabled={!state.report?.playwrightScript}
              className="justify-center py-1 text-[11px] px-1"
              icon={<DownloadIcon className="size-3" />}
            >
              .spec.ts
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void handleCopy(state.report?.playwrightScript ?? '', 'Playwright')
              }
              disabled={!state.report?.playwrightScript}
              className="justify-center py-1 text-[11px] px-1"
              icon={<CopyIcon className="size-3" />}
            >
              Playwright
            </Button>
            <Button
              variant="ghost"
              onClick={() => void handleCopy(state.report?.markdown ?? '', 'Report')}
              disabled={!state.report?.markdown}
              className="justify-center py-1 text-[11px] px-1"
              icon={<CopyIcon className="size-3" />}
            >
              Report
            </Button>
          </div>
        </div>

        {/* 5. Collapsed Preview Code Accordion & Other Data */}
        <div className="shrink-0 space-y-2 pb-2">
          <Collapsible title="Preview Code" defaultOpen={false}>
            <div className="space-y-2 pt-1">
              <SegmentedControl
                full
                label="Generated output"
                value={previewTab}
                onChange={setPreviewTab}
                options={[
                  { value: 'playwright', label: 'Playwright Script' },
                  { value: 'markdown', label: 'Markdown Report' },
                ]}
              />
              <pre className="max-h-48 min-h-20 overflow-auto rounded-lg border border-surface-border bg-surface-sunken p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
                {previewContent || 'No output generated.'}
              </pre>
            </div>
          </Collapsible>

          {snapshot && (
            <>
              <Collapsible
                title="Failed Requests"
                badge={`${(snapshot.network ?? []).filter((entry) => entry.outcome !== 'success').length}`}
              >
                <NetworkPanel entries={snapshot.network ?? []} />
              </Collapsible>

              <Collapsible title="Console Errors" badge={`${snapshot.consoleErrors.length}`}>
                <ConsoleErrorsPanel errors={snapshot.consoleErrors} />
              </Collapsible>
            </>
          )}
        </div>
      </main>

      {/* 6. Footer: Start Over */}
      <footer className="shrink-0 border-t border-surface-border px-4 py-3">
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={pending}
          className="w-full py-2 text-xs"
          icon={<ResetIcon className="size-3.5" />}
        >
          Start Over
        </Button>
      </footer>
    </>
  )
}
