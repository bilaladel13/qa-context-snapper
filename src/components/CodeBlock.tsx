import { useEffect, useState } from 'react'
import { Button } from './Button'

interface CodeBlockProps {
  content: string
  placeholder: string
}

export function CodeBlock({ content, placeholder }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const isEmpty = content.length === 0

  useEffect(() => {
    if (!copied) {
      return
    }

    const id = window.setTimeout(() => setCopied(false), 1500)

    return () => window.clearTimeout(id)
  }, [copied])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <pre className="h-40 overflow-auto rounded-lg border border-surface-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-slate-300">
        {isEmpty ? <span className="text-slate-500">{placeholder}</span> : content}
      </pre>
      <Button variant="ghost" disabled={isEmpty} onClick={handleCopy} className="w-full">
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}
