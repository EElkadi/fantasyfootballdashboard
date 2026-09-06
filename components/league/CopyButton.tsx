'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Copies `text` to the clipboard, falling back to showing it for manual copy. */
export function CopyButton({ text, label = 'Copy for the group chat' }: { text: string; label?: string }) {
  const [note, setNote] = useState('')
  const [show, setShow] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Copied.')
    } catch {
      setShow(true)
      setNote('Select and copy the text below.')
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {label}
        </Button>
        <button type="button" onClick={() => setShow((v) => !v)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          {show ? 'Hide text' : 'Preview'}
        </button>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {show && <pre className="max-w-xl whitespace-pre-wrap rounded-xl border bg-card p-3 text-sm leading-relaxed">{text}</pre>}
    </div>
  )
}
