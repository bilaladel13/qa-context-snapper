import { useEffect, useState } from 'react'
import { Button } from './Button'
import { CheckIcon, CopyIcon, DownloadIcon } from './icons'

interface CodeBlockProps {
  content: string
  placeholder: string
  filename: string
  mimeType: string
}

export function CodeBlock({ content, placeholder, filename, mimeType }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const isEmpty = content.length === 0

  useEffect(() => {
    setCopied(false)
    setFailed(false)
  }, [content])

  useEffect(() => {
    if (!copied && !failed) {
      return
    }

    const id = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, 1600)

    return () => clearTimeout(id)
  }, [copied, failed])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
    } catch {
      setFailed(true)
    }
  }

  // chrome.downloads would need an extra permission; an object URL does not.
  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename
    anchor.click()

    URL.revokeObjectURL(url)
  }

  const copyLabel = failed ? 'Copy failed' : copied ? 'Copied' : 'Copy'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <pre className="min-h-24 flex-1 overflow-auto rounded-lg border border-surface-border bg-surface-sunken p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
        {isEmpty ? <span className="text-ink-subtle">{placeholder}</span> : content}
      </pre>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          disabled={isEmpty}
          onClick={handleCopy}
          className="flex-1 py-2 text-xs"
          icon={copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        >
          {copyLabel}
        </Button>
        <Button
          variant="ghost"
          disabled={isEmpty}
          onClick={handleDownload}
          className="py-2 text-xs"
          icon={<DownloadIcon className="size-3.5" />}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
