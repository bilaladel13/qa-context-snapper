import { useEffect, useState } from 'react'
import { requestDownload } from '@/messaging/client'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { TextInput } from './TextInput'
import { CheckIcon, CopyIcon, DownloadIcon } from './icons'

interface CodeBlockProps {
  content: string
  placeholder: string
  filename: string
  filenameLabel: string
  extension: string
  onFilenameChange: (filename: string) => void
}

export function CodeBlock({
  content,
  placeholder,
  filename,
  filenameLabel,
  extension,
  onFilenameChange,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isEmpty = content.length === 0

  useEffect(() => {
    setCopied(false)
    setStatus(null)
  }, [content])

  useEffect(() => {
    if (!copied && !status) {
      return
    }

    const id = setTimeout(() => {
      setCopied(false)
      setStatus(null)
    }, 2200)

    return () => clearTimeout(id)
  }, [copied, status])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
    } catch {
      setStatus('Copy failed')
    }
  }

  // The worker owns the download: the Save As dialog takes focus and closes this
  // popup, which would revoke any object URL created here before Chrome reads it.
  const handleSave = async () => {
    setSaving(true)

    const response = await requestDownload({ type: 'DOWNLOAD_FILE', content, filename })

    setSaving(false)
    setStatus(response.ok ? (response.data.cancelled ? null : 'Saved') : response.error)
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="relative">
        <pre className="max-h-28 min-h-20 overflow-auto rounded-lg border border-surface-border bg-surface-sunken p-3 pr-10 pt-10 font-mono text-[11px] leading-relaxed text-ink-muted">
          {isEmpty ? <span className="text-ink-subtle">{placeholder}</span> : content}
        </pre>
        <IconButton
          label={copied ? 'Copied' : 'Copy'}
          active={copied}
          disabled={isEmpty}
          onClick={() => void handleCopy()}
          className="absolute right-2 top-2"
          icon={copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        />
      </div>

      {/* Labelled because the two tabs are otherwise indistinguishable at a
          glance, which makes it easy to save the report thinking it is code. */}
      <div className="shrink-0 space-y-1">
        <label
          htmlFor="download-filename"
          className="block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
        >
          {filenameLabel}
        </label>
        <div className="flex items-center gap-2">
          <TextInput
            mono
            id="download-filename"
            value={filename}
            disabled={isEmpty}
            onChange={(event) => onFilenameChange(event.target.value)}
            placeholder={`name${extension}`}
            className="flex-1 py-1.5 text-[11px]"
          />
          <Button
            variant="ghost"
            disabled={isEmpty || saving}
            onClick={() => void handleSave()}
            className="shrink-0 px-3 py-1.5 text-xs"
            icon={<DownloadIcon className="size-3.5" />}
          >
            {saving ? 'Saving' : 'Save as'}
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {status ? (
          <span className="shrink-0 truncate text-[10px] text-ink-muted" title={status}>
            {status}
          </span>
        ) : null}
      </div>
    </div>
  )
}
