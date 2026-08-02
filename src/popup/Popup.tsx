import { useState } from 'react'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Header } from '@/components/Header'
import { IdleView } from '@/views/IdleView'
import { JiraView } from '@/views/JiraView'
import { RecordingView } from '@/views/RecordingView'
import { ResultView } from '@/views/ResultView'
import { SettingsView } from '@/views/SettingsView'
import { useEnvironment } from './useEnvironment'
import { useJira } from './useJira'
import { useRecorder } from './useRecorder'
import { useSettings } from './useSettings'
import { SHORTCUTS_PAGE, useShortcut } from './useShortcut'
import { useTheme } from './useTheme'

const TOGGLE_COMMAND = 'toggle-recording'

type Route = 'main' | 'settings' | 'jira'

const TITLES: Partial<Record<Route, string>> = {
  settings: 'Settings',
  jira: 'Create Jira Ticket',
}

export function Popup() {
  const version = chrome.runtime?.getManifest?.().version ?? '0.0.0'
  const [route, setRoute] = useState<Route>('main')

  const settings = useSettings()
  const recorder = useRecorder()
  const environment = useEnvironment()
  const jira = useJira()
  const shortcut = useShortcut(TOGGLE_COMMAND)

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
          onOpenSettings={() => setRoute('settings')}
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
          onStop={recorder.stop}
          onFocusTab={recorder.focusTab}
        />
      ) : state.status === 'result' ? (
        <ResultView
          state={state}
          pending={pending}
          onReset={recorder.reset}
          onCreateTicket={() => setRoute('jira')}
        />
      ) : (
        <IdleView
          environment={environment}
          pending={pending}
          shortcut={shortcut}
          onStart={recorder.start}
        />
      )}
    </div>
  )
}
