import { Section } from './Section'

const PLACEHOLDER_ROWS = [
  { label: 'Browser', value: 'Not captured yet' },
  { label: 'OS', value: 'Not captured yet' },
  { label: 'Screen size', value: 'Not captured yet' },
  { label: 'Viewport', value: 'Not captured yet' },
  { label: 'Page URL', value: 'Not captured yet' },
]

export function EnvironmentPanel() {
  return (
    <Section title="Environment Data" badge="placeholder">
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
        {PLACEHOLDER_ROWS.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-slate-400">{row.label}</dt>
            <dd className="truncate font-mono text-[11px] text-slate-300">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
