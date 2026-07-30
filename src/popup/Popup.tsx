import { ErrorBanner } from '@/components/ErrorBanner'
import { Header } from '@/components/Header'
import { IdleView } from '@/views/IdleView'
import { RecordingView } from '@/views/RecordingView'
import { ResultView } from '@/views/ResultView'
import { useRecorder } from './useRecorder'

export function Popup() {
  const version = chrome.runtime?.getManifest?.().version ?? '0.0.0'
  const { state, error, pending, start, stop, reset, dismissError } = useRecorder()

  return (
    <div className="flex min-h-[320px] flex-col">
      <Header version={version} recording={state?.status === 'recording'} />

      {error ? (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} onDismiss={dismissError} />
        </div>
      ) : null}

      {state === null ? (
        <main className="flex flex-1 items-center justify-center px-4 py-6">
          <p className="text-xs text-slate-500">Loading</p>
        </main>
      ) : state.status === 'recording' ? (
        <RecordingView state={state} pending={pending} onStop={stop} />
      ) : state.status === 'result' ? (
        <ResultView state={state} pending={pending} onReset={reset} />
      ) : (
        <IdleView pending={pending} onStart={start} />
      )}
    </div>
  )
}
