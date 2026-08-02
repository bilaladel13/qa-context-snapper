import { useState } from 'react'
import type { JiraController } from '@/popup/useJira'
import { Button } from './Button'
import { Field } from './Field'
import { TextInput } from './TextInput'
import { CheckIcon, ExternalIcon } from './icons'

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens'

interface JiraConnectionCardProps {
  jira: JiraController
}

export function JiraConnectionCard({ jira }: JiraConnectionCardProps) {
  const [domain, setDomain] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')

  const submit = async () => {
    const success = await jira.connect(domain, email, token)

    if (success) {
      // Nothing keeps the token in component state once Jira has accepted it.
      setToken('')
      setDomain('')
      setEmail('')
    }
  }

  if (jira.connection) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-strong text-on-accent">
            <CheckIcon className="size-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">
              {jira.connection.accountName ?? jira.connection.email}
            </p>
            <p className="truncate text-[10px] text-ink-subtle">
              {jira.connection.domain.replace(/^https:\/\//, '')}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => void jira.disconnect()}
            disabled={jira.busy}
            className="shrink-0 px-2 py-1 text-[11px]"
          >
            Disconnect
          </Button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-ink-subtle">
          The API token is stored by the extension and never shown again. Revoke it from your
          Atlassian account at any time.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface-raised px-3">
      <Field
        label="Site address"
        hint="Your Jira Cloud site. Typing just the site name is enough, for example acme."
        htmlFor="jira-domain"
        stacked
      >
        <TextInput
          id="jira-domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="acme.atlassian.net"
        />
      </Field>

      <Field
        label="Account email"
        hint="The Atlassian account the API token belongs to. Tickets are created as this user."
        htmlFor="jira-email"
        stacked
      >
        <TextInput
          id="jira-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
        />
      </Field>

      <Field
        label="API token"
        hint="Created from your Atlassian account security page. It is verified before being saved, and is never sent anywhere except your own Jira site."
        htmlFor="jira-token"
        stacked
      >
        <input
          id="jira-token"
          type="password"
          value={token}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste the token"
          className="w-full rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 font-mono text-xs text-ink transition-colors placeholder:font-sans placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: TOKEN_PAGE })}
          className="flex items-center gap-1 text-[10px] text-ink-muted transition-colors hover:text-ink"
        >
          <ExternalIcon className="size-3" />
          Create an API token
        </button>
      </Field>

      <div className="py-2">
        <Button
          onClick={() => void submit()}
          disabled={jira.busy || !domain.trim() || !email.trim() || !token.trim()}
          className="w-full py-2 text-xs"
        >
          {jira.busy ? 'Verifying' : 'Connect to Jira'}
        </Button>
      </div>
    </div>
  )
}
