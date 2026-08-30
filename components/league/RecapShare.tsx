'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LEAGUE, ownerColor } from '@/lib/league'

export interface RecapData {
  season: number
  week: number
  weekLabel?: string
  results: { winner: string; loser: string; winScore: number; loseScore: number; tiebreaker?: boolean }[]
  topScore?: { team: string; score: number }
  mvp?: { player: string; team: string; score: number; slot: string }
  standings: { team: string; record: string }[]
}

const W = 1080
const H = 1080
const PAD = 56
const GREEN = '#34d399'
const MUTED = 'rgba(226, 232, 240, 0.62)'
const LINE = 'rgba(148, 163, 184, 0.25)'
const FG = '#f1f5f9'

/**
 * WhatsApp-ready weekly recap image, drawn directly on a canvas so what you
 * preview is exactly the PNG that gets shared. Native share sheet on mobile
 * (straight into the league chat), PNG download elsewhere.
 */
export function RecapShare({ data }: { data: RecapData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    await document.fonts.ready
    // next/font gives Inter a generated family name — read it off the body
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
    const font = (weight: number, size: number) => `${weight} ${size}px ${family}`

    // Background
    const grad = ctx.createLinearGradient(0, 0, W * 0.55, H)
    grad.addColorStop(0, '#0b1220')
    grad.addColorStop(0.55, '#101c33')
    grad.addColorStop(1, '#0c2921')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    // Header
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = GREEN
    ctx.font = font(700, 25)
    drawTracked(ctx, 'PREMIER LEAGUE FANTASY FOOTBALL', PAD, PAD + 22, 4)
    ctx.fillStyle = MUTED
    ctx.font = font(600, 30)
    ctx.textAlign = 'right'
    ctx.fillText(String(data.season), W - PAD, PAD + 24)
    ctx.textAlign = 'left'
    ctx.fillStyle = FG
    ctx.font = font(800, 58)
    ctx.fillText(`Week ${data.week} Recap${data.weekLabel ? ` · ${data.weekLabel}` : ''}`, PAD - 2, PAD + 88)

    // Layout columns
    const top = PAD + 140
    const leftX = PAD
    const leftW = 560
    const rightX = PAD + leftW + 44
    const rightW = W - PAD - rightX

    // Results
    const rowH = 66
    data.results.forEach((r, i) => {
      const y = top + i * rowH
      const mid = y + rowH / 2 + 10
      dot(leftX + 9, mid - 10, 8, ownerColor(r.winner))
      ctx.fillStyle = FG
      ctx.font = font(700, 33)
      ctx.fillText(fit(ctx, r.winner, 150), leftX + 30, mid)
      ctx.font = font(800, 33)
      ctx.textAlign = 'center'
      ctx.fillText(`${r.winScore}–${r.loseScore}`, leftX + 268, mid)
      ctx.textAlign = 'left'
      dot(leftX + 356, mid - 10, 8, ownerColor(r.loser))
      ctx.fillStyle = MUTED
      ctx.font = font(500, 33)
      ctx.fillText(fit(ctx, r.loser, 140), leftX + 377, mid)
      if (r.tiebreaker) {
        ctx.fillStyle = GREEN
        ctx.font = font(700, 21)
        ctx.fillText('TB', leftX + leftW - 34, mid)
      }
      if (i < data.results.length - 1) {
        ctx.strokeStyle = LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(leftX, y + rowH)
        ctx.lineTo(leftX + leftW, y + rowH)
        ctx.stroke()
      }
    })

    // Award chips
    const chipY = top + data.results.length * rowH + 40
    const chip = (x: number, w: number, label: string, line1: string, line2: string) => {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.08)'
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)'
      ctx.lineWidth = 1.5
      roundRect(ctx, x, chipY, w, 132, 18)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(226,232,240,0.6)'
      ctx.font = font(600, 20)
      drawTracked(ctx, label.toUpperCase(), x + 24, chipY + 38, 3)
      ctx.fillStyle = FG
      ctx.font = font(800, 30)
      ctx.fillText(fit(ctx, line1, w - 48), x + 24, chipY + 76)
      ctx.fillStyle = 'rgba(226,232,240,0.75)'
      ctx.font = font(500, 23)
      ctx.fillText(fit(ctx, line2, w - 48), x + 24, chipY + 110)
    }
    if (data.topScore) chip(leftX, 258, 'Top score', data.topScore.team, `${data.topScore.score} pts`)
    if (data.mvp) chip(leftX + 278, 282, 'MVP', data.mvp.player, `${data.mvp.score} pts · ${data.mvp.team}`)

    // Standings
    ctx.fillStyle = MUTED
    ctx.font = font(700, 23)
    drawTracked(ctx, 'STANDINGS', rightX, top + 6, 3)
    const sTop = top + 26
    const sRowH = 57
    data.standings.forEach((t, i) => {
      const y = sTop + i * sRowH
      const mid = y + sRowH / 2 + 9
      ctx.fillStyle = MUTED
      ctx.font = font(500, 26)
      ctx.fillText(String(i + 1), rightX, mid)
      dot(rightX + 52, mid - 8, 7, ownerColor(t.team))
      ctx.fillStyle = FG
      ctx.font = font(600, 26)
      ctx.fillText(fit(ctx, t.team, rightW - 150), rightX + 70, mid)
      ctx.fillStyle = MUTED
      ctx.textAlign = 'right'
      ctx.fillText(t.record, rightX + rightW, mid)
      ctx.textAlign = 'left'
      const isPlayoffLine = i === LEAGUE.playoffTeams - 1
      ctx.strokeStyle = isPlayoffLine ? GREEN : LINE
      ctx.lineWidth = isPlayoffLine ? 3 : 1
      ctx.beginPath()
      ctx.moveTo(rightX, y + sRowH)
      ctx.lineTo(rightX + rightW, y + sRowH)
      ctx.stroke()
    })

    // Footer
    ctx.fillStyle = MUTED
    ctx.font = font(500, 22)
    ctx.fillText('Since 2015 · $3,600 on the line', PAD, H - PAD + 8)
    ctx.textAlign = 'right'
    ctx.fillText(data.week > 14 ? `Playoffs · week ${data.week}` : `Week ${data.week} of 14`, W - PAD, H - PAD + 8)
    ctx.textAlign = 'left'
  }, [data])

  useEffect(() => {
    draw()
  }, [draw])

  const share = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    setNote('')
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      const file = new File([blob], `plff-week-${data.week}-recap.png`, { type: 'image/png' })
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Week ${data.week} Recap` })
        setNote('Shared!')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
        setNote('Downloaded — drop it in the chat.')
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setNote('Could not generate the image — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={share} disabled={busy}>
          {busy ? 'Rendering…' : 'Share / download image'}
        </Button>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full max-w-[540px] rounded-xl border shadow-sm"
        aria-label={`Week ${data.week} recap card`}
      />
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Letter-spaced text (canvas has no letter-spacing in all browsers). */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
}

/** Truncate with ellipsis to fit maxWidth at the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t + '…'
}
