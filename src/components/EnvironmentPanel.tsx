import type { EnvironmentSnapshot } from '@/types'
import { Section } from './Section'

interface EnvironmentPanelProps {
  environment: EnvironmentSnapshot | null
  loading: boolean
}

function rows(environment: EnvironmentSnapshot): [string, string][] {
  return [
    ['Browser', `${environment.browser} ${environment.browserVersion}`],
    ['OS', environment.os],
    ['Screen', `${environment.screenSize} at ${environment.devicePixelRatio}x`],
    ['Viewport', environment.viewportSize],
    ['Language', environment.language],
    ['Page', environment.pageUrl],
  ]
}

export function EnvironmentPanel({ environment, loading }: EnvironmentPanelProps) {
  return (
    <Section title="Environment" badge={loading ? 'reading' : undefined}>
      {environment === null ? (
        <div className="space-y-1.5" aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-3 animate-pulse rounded bg-surface-hover" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-xs">
          {rows(environment).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="truncate font-mono text-[11px] text-ink" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}
