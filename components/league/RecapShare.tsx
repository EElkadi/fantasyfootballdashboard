'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CARD_SIZE, RecapData, recapCards } from './recapCards'

export type { RecapData } from './recapCards'

/**
 * The weekly recap as a set of WhatsApp-ready square cards plus a text
 * version. On a phone the share sheet sends every card in one go, straight
 * into the league chat; elsewhere each card downloads as a PNG.
 */
export function RecapShare({ data, text }: { data: RecapData; text: string }) {
  const cards = useMemo(() => recapCards(data), [data])
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled) return
      // next/font gives Inter a generated family name — read it off the body
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
      cards.forEach((card, i) => {
        const ctx = canvases.current[i]?.getContext('2d')
        if (ctx) card.draw(ctx, family)
      })
    })
    return () => {
      cancelled = true
    }
  }, [cards])

  const toFile = async (i: number): Promise<File | null> => {
    const canvas = canvases.current[i]
    if (!canvas) return null
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? new File([blob], `plff-week-${data.week}-${cards[i].key}.png`, { type: 'image/png' }) : null
  }

  const download = (file: File) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareAll = async () => {
    setBusy(true)
    setNote('')
    try {
      const files = (await Promise.all(cards.map((_, i) => toFile(i)))).filter((f): f is File => f !== null)
      if (files.length === 0) return
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: `Week ${data.week} Recap` })
        setNote('Shared!')
      } else {
        files.forEach(download)
        setNote(`Downloaded ${files.length} image${files.length === 1 ? '' : 's'} — drop them in the chat.`)
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setNote('Could not generate the images — try again.')
    } finally {
      setBusy(false)
    }
  }

  const downloadOne = async (i: number) => {
    const file = await toFile(i)
    if (file) download(file)
  }

  const copyText = async () => {
    setNote('')
    try {
      await navigator.clipboard.writeText(text)
      setNote('Copied — paste it into the group chat.')
    } catch {
      // Clipboard API needs a secure context and permission; fall back to showing the text
      setShowText(true)
      setNote('Select the text below and copy it.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={shareAll} disabled={busy}>
          {busy ? 'Rendering…' : cards.length > 1 ? `Share all ${cards.length} images` : 'Share / download image'}
        </Button>
        <Button variant="outline" onClick={copyText}>
          Copy for the group chat
        </Button>
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {showText ? 'Hide text' : 'Preview text'}
        </button>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </div>
      {showText && (
        <pre className="max-w-[540px] whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-relaxed shadow-sm">
          {text}
        </pre>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, i) => (
          <figure key={card.key} className="space-y-1.5">
            <canvas
              ref={(el) => {
                canvases.current[i] = el
              }}
              width={CARD_SIZE}
              height={CARD_SIZE}
              className="w-full rounded-xl border shadow-sm"
              aria-label={`Week ${data.week} ${card.label.toLowerCase()} card`}
            />
            <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {i + 1}. {card.label}
              </span>
              <button type="button" onClick={() => downloadOne(i)} className="underline-offset-2 hover:underline">
                Download
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
