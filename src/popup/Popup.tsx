import { useState } from 'react'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Header } from '@/components/Header'
import { IdleView } from '@/views/IdleView'
import { JiraView } from '@/views/JiraView'
import { QaseView } from '@/views/QaseView'
import { RecordingView } from '@/views/RecordingView'
import { ResultView } from '@/views/ResultView'
import { SettingsView } from '@/views/SettingsView'
import { useEnvironment } from './useEnvironment'
import { useJira } from './useJira'
import { useQase } from './useQase'
import { useRecorder } from './useRecorder'
import { useSettings } from './useSettings'
import { SHORTCUTS_PAGE, useShortcut } from './useShortcut'
import { useTheme } from './useTheme'

const TOGGLE_COMMAND = 'toggle-recording'
const ASSERT_COMMAND = 'toggle-assertion-mode'

type Route = 'main' | 'settings' | 'jira' | 'qase'

const TITLES: Partial<Record<Route, string>> = {
  settings: 'Settings',
  jira: 'Create Jira Ticket',
  qase: 'Sync to Qase',
}

export function Popup() {
  const version = chrome.runtime?.getManifest?.().version ?? '0.0.0'
  const [route, setRoute] = useState<Route>('main')

  const settings = useSettings()
  const recorder = useRecorder()
  const environment = useEnvironment()
  const jira = useJira()
  const qase = useQase()
  const shortcut = useShortcut(TOGGLE_COMMAND)
  const assertShortcut = useShortcut(ASSERT_COMMAND)

  useTheme(settings.settings.theme)

  const { state, error, pending } = recorder
  const recording = state?.status === 'recording'

  const openShortcuts = () => {
    void chrome.tabs.create({ url: SHORTCUTS_PAGE })
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        version={version}
        recording={recording}
        title={TITLES[route]}
        onOpenSettings={() => setRoute('settings')}
        onBack={route === 'main' ? undefined : () => setRoute('main')}
      />

      {error ? (
        <div className="shrink-0 px-4 pt-3">
          <ErrorBanner message={error} onDismiss={recorder.dismissError} />
        </div>
      ) : null}

      {route === 'settings' ? (
        <SettingsView
          controller={settings}
          jira={jira}
          shortcut={shortcut}
          onOpenShortcuts={openShortcuts}
        />
      ) : route === 'jira' ? (
        <JiraView
          jira={jira}
          settings={settings}
          snapshot={state?.snapshot ?? null}
          screenshot={state?.screenshot ?? null}
          screenshotError={state?.screenshotError ?? null}
          qaseCaseCode={state?.qaseCaseCode ?? null}
          onOpenSettings={() => setRoute('settings')}
        />
      ) : route === 'qase' ? (
        <QaseView
          qase={qase}
          snapshot={state?.snapshot ?? null}
          onUpdateStep={recorder.updateStep}
          onDeleteStep={recorder.deleteStep}
          onBack={() => setRoute('main')}
          onCreateTicket={(caseCode) => {
            if (state) {
              state.qaseCaseCode = caseCode
            }
            setRoute('jira')
          }}
        />
      ) : state === null ? (
        <main className="flex flex-1 items-center justify-center px-4 py-6">
          <p className="text-xs text-ink-subtle">Loading</p>
        </main>
      ) : state.status === 'recording' ? (
        <RecordingView
          state={state}
          pending={pending}
          shortcut={shortcut}
          assertShortcut={assertShortcut}
          onStop={recorder.stop}
          onFocusTab={recorder.focusTab}
          onAddAssertion={recorder.startAssertion}
          onAddStepMarker={recorder.addStepMarker}
        />
      ) : state.status === 'result' ? (
        <ResultView
          state={state}
          pending={pending}
          onReset={recorder.reset}
          onCreateTicket={() => setRoute('jira')}
          onOpenQase={() => setRoute('qase')}
          onDeleteStep={recorder.deleteStep}
          onUpdateStep={recorder.updateStep}
          onUpdateSessionTitle={recorder.updateSessionTitle}
        />
      ) : (
        <IdleView
          environment={environment}
          pending={pending}
          shortcut={shortcut}
          qase={qase}
          onStart={recorder.start}
          onLoadDemo={recorder.loadDemo}
        />
      )}
    </div>
  )
}
