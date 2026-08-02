import { useEffect, useState } from 'react'
import { requestDownload } from '@/messaging/client'
import { Button } from './Button'
import { TextInput } from './TextInput'
import { CheckIcon, CopyIcon, DownloadIcon } from './icons'

interface CodeBlockProps {
  content: string
  placeholder: string
  filename: string
  extension: string
  onFilenameChange: (filename: string) => void
}

export function CodeBlock({
  content,
  placeholder,
  filename,
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <pre className="min-h-24 flex-1 overflow-auto rounded-lg border border-surface-border bg-surface-sunken p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
        {isEmpty ? <span className="text-ink-subtle">{placeholder}</span> : content}
      </pre>

      <div className="flex shrink-0 items-center gap-2">
        <TextInput
          mono
          value={filename}
          disabled={isEmpty}
          aria-label="File name"
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

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          disabled={isEmpty}
          onClick={() => void handleCopy()}
          className="flex-1 py-1.5 text-xs"
          icon={copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {status ? (
          <span className="shrink-0 truncate text-[10px] text-ink-muted" title={status}>
            {status}
          </span>
        ) : null}
      </div>
    </div>
  )
}
