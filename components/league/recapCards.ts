import { LEAGUE, ownerColor } from '@/lib/league'
import type { WeeklyScoreRow } from '@/lib/data/standings'
import type { PowerLine, StandingLine } from '@/lib/recap/metrics'

/**
 * The weekly recap as a set of square share cards, drawn straight onto a
 * canvas so the preview is exactly the PNG that lands in the chat:
 *
 *   1. Recap — results, the week's scoring order, standings
 *   2. Awards — MVP and the six weekly awards
 *   3. Power rankings — power, movement, record, playoff odds, luck
 */

export interface RecapData {
  season: number
  week: number
  weekLabel?: string
  results: { winner: string; loser: string; winScore: number; loseScore: number; tiebreaker?: boolean }[]
  topScore?: { team: string; score: number }
  mvp?: { player: string; team: string; score: number; slot: string }
  standings: StandingLine[]
  /** The week's scoring order; omitted in the playoffs, where top-6 doesn't apply */
  weeklyScores?: WeeklyScoreRow[]
  awards: { emoji: string; name: string; team: string; detail: string }[]
  /** regular season only */
  power?: PowerLine[]
  oddsNote?: string
}

export interface RecapCard {
  key: 'recap' | 'awards' | 'power'
  label: string
  draw: (ctx: CanvasRenderingContext2D, family: string) => void
}

export const CARD_SIZE = 1080
const W = CARD_SIZE
const H = CARD_SIZE
const PAD = 56
const GREEN = '#34d399'
const RED = '#f87171'
const MUTED = 'rgba(226, 232, 240, 0.62)'
const LINE = 'rgba(148, 163, 184, 0.25)'
const FG = '#f1f5f9'
const TOP = PAD + 140

/** The cards this week's data supports, in posting order. */
export function recapCards(data: RecapData): RecapCard[] {
  const cards: RecapCard[] = [{ key: 'recap', label: 'Recap', draw: (ctx, f) => drawRecap(ctx, f, data) }]
  if (data.awards.length > 0 || data.mvp) cards.push({ key: 'awards', label: 'Awards', draw: (ctx, f) => drawAwards(ctx, f, data) })
  if (data.power && data.power.length > 0) {
    cards.push({ key: 'power', label: 'Power rankings', draw: (ctx, f) => drawPower(ctx, f, data) })
  }
  return cards
}

// --- shared frame -----------------------------------------------------------

type Font = (weight: number, size: number) => string

function frame(ctx: CanvasRenderingContext2D, family: string, data: RecapData, title: string): Font {
  const font: Font = (weight, size) => `${weight} ${size}px ${family}`
  const grad = ctx.createLinearGradient(0, 0, W * 0.55, H)
  grad.addColorStop(0, '#0b1220')
  grad.addColorStop(0.55, '#101c33')
  grad.addColorStop(1, '#0c2921')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
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
  ctx.fillText(fit(ctx, title, W - 2 * PAD), PAD - 2, PAD + 88)

  ctx.fillStyle = MUTED
  ctx.font = font(500, 22)
  const pot = LEAGUE.payouts.reduce((sum, p) => sum + p.amount, 0).toLocaleString()
  ctx.fillText(`Since ${LEAGUE.since} · $${pot} on the line`, PAD, H - PAD + 8)
  ctx.textAlign = 'right'
  const weeks = LEAGUE.regularSeasonWeeks
  ctx.fillText(data.week > weeks ? `Playoffs · week ${data.week}` : `Week ${data.week} of ${weeks}`, W - PAD, H - PAD + 8)
  ctx.textAlign = 'left'
  return font
}

const weekTitle = (data: RecapData, what: string) => `Week ${data.week} ${what}${data.weekLabel ? ` · ${data.weekLabel}` : ''}`

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

// --- 1. recap ---------------------------------------------------------------

function drawRecap(ctx: CanvasRenderingContext2D, family: string, data: RecapData) {
  const font = frame(ctx, family, data, weekTitle(data, 'Recap'))
  const leftX = PAD
  const leftW = 560
  const rightX = PAD + leftW + 44
  const rightW = W - PAD - rightX

  const rowH = 66
  data.results.forEach((r, i) => {
    const y = TOP + i * rowH
    const mid = y + rowH / 2 + 10
    dot(ctx, leftX + 9, mid - 10, 8, ownerColor(r.winner))
    ctx.fillStyle = FG
    ctx.font = font(700, 33)
    ctx.fillText(fit(ctx, r.winner, 150), leftX + 30, mid)
    ctx.font = font(800, 33)
    ctx.textAlign = 'center'
    ctx.fillText(`${r.winScore}–${r.loseScore}`, leftX + 268, mid)
    ctx.textAlign = 'left'
    dot(ctx, leftX + 356, mid - 10, 8, ownerColor(r.loser))
    ctx.fillStyle = MUTED
    ctx.font = font(500, 33)
    ctx.fillText(fit(ctx, r.loser, 140), leftX + 377, mid)
    if (r.tiebreaker) {
      ctx.fillStyle = GREEN
      ctx.font = font(700, 21)
      ctx.fillText('TB', leftX + leftW - 34, mid)
    }
    if (i < data.results.length - 1) hline(ctx, leftX, leftX + leftW, y + rowH, LINE, 1)
  })

  const chipY = TOP + data.results.length * rowH + 40
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

  // The week's scoring order — the half of everyone's record the results don't show
  const weekly = data.weeklyScores ?? []
  if (weekly.length > 0) {
    const colW = 264
    const headY = chipY + 132 + 46
    const column = (x: number, label: string, rows: WeeklyScoreRow[], won: boolean) => {
      ctx.fillStyle = won ? GREEN : MUTED
      ctx.font = font(700, 20)
      drawTracked(ctx, label.toUpperCase(), x, headY, 3)
      rows.forEach((r, i) => {
        const y = headY + 34 + i * 31
        ctx.fillStyle = MUTED
        ctx.font = font(500, 22)
        ctx.textAlign = 'right'
        ctx.fillText(String(r.rank), x + 18, y)
        ctx.textAlign = 'left'
        dot(ctx, x + 36, y - 8, 7, ownerColor(r.team))
        ctx.fillStyle = won ? FG : MUTED
        ctx.font = font(600, 25)
        ctx.fillText(fit(ctx, r.team, colW - 122), x + 52, y)
        ctx.fillStyle = won ? GREEN : MUTED
        ctx.font = font(700, 25)
        ctx.textAlign = 'right'
        ctx.fillText(String(r.score), x + colW, y)
        ctx.textAlign = 'left'
      })
    }
    const made = weekly.filter((r) => r.top6)
    const missed = weekly.filter((r) => !r.top6)
    column(leftX, `Top ${made.length} · extra win`, made, true)
    column(leftX + leftW - colW, `Bottom ${missed.length}`, missed, false)
  }

  ctx.fillStyle = MUTED
  ctx.font = font(700, 23)
  drawTracked(ctx, 'STANDINGS', rightX, TOP + 6, 3)
  const sTop = TOP + 26
  const sRowH = 57
  data.standings.forEach((t, i) => {
    const y = sTop + i * sRowH
    const mid = y + sRowH / 2 + 9
    ctx.fillStyle = MUTED
    ctx.font = font(500, 26)
    ctx.fillText(String(i + 1), rightX, mid)
    dot(ctx, rightX + 52, mid - 8, 7, ownerColor(t.team))
    ctx.fillStyle = FG
    ctx.font = font(600, 26)
    ctx.fillText(fit(ctx, t.team, rightW - 150), rightX + 70, mid)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.fillText(t.record, rightX + rightW, mid)
    ctx.textAlign = 'left'
    const playoffLine = i === LEAGUE.playoffTeams - 1
    hline(ctx, rightX, rightX + rightW, y + sRowH, playoffLine ? GREEN : LINE, playoffLine ? 3 : 1)
  })
}

// --- 2. awards --------------------------------------------------------------

function drawAwards(ctx: CanvasRenderingContext2D, family: string, data: RecapData) {
  const font = frame(ctx, family, data, weekTitle(data, 'Awards'))
  const gap = 20
  const colW = (W - 2 * PAD - gap) / 2
  const tiles: { emoji: string; name: string; headline: string; team?: string; detail: string; wide?: boolean }[] = []
  if (data.mvp) {
    tiles.push({
      emoji: '⭐',
      name: 'MVP',
      headline: data.mvp.player,
      detail: `${data.mvp.score} pts · ${data.mvp.slot} · ${data.mvp.team}`,
      wide: true,
    })
  }
  for (const a of data.awards) tiles.push({ emoji: a.emoji, name: a.name, headline: a.team, team: a.team, detail: a.detail })

  const rows = (tiles[0]?.wide ? 1 : 0) + Math.ceil(tiles.filter((t) => !t.wide).length / 2)
  const available = H - PAD - 40 - TOP
  const tileH = Math.min(200, (available - gap * (rows - 1)) / Math.max(rows, 1))

  let slot = 0
  let y = TOP
  for (const t of tiles) {
    const w = t.wide ? W - 2 * PAD : colW
    const x = t.wide ? PAD : PAD + (slot % 2) * (colW + gap)
    ctx.fillStyle = t.wide ? 'rgba(52, 211, 153, 0.10)' : 'rgba(148, 163, 184, 0.07)'
    ctx.strokeStyle = t.wide ? 'rgba(52, 211, 153, 0.40)' : LINE
    ctx.lineWidth = 1.5
    roundRect(ctx, x, y, w, tileH, 20)
    ctx.fill()
    ctx.stroke()

    // Opaque fill, or the emoji inherits the tile's translucency
    ctx.fillStyle = FG
    ctx.font = font(400, 34)
    ctx.fillText(t.emoji, x + 26, y + 54)
    ctx.fillStyle = t.wide ? GREEN : MUTED
    ctx.font = font(700, 21)
    drawTracked(ctx, t.name.toUpperCase(), x + 76, y + 49, 3)

    const headY = y + tileH / 2 + 26
    let textX = x + 28
    if (t.team) {
      dot(ctx, x + 38, headY - 12, 10, ownerColor(t.team))
      textX = x + 60
    }
    ctx.fillStyle = FG
    ctx.font = font(800, t.wide ? 46 : 40)
    ctx.fillText(fit(ctx, t.headline, w - (textX - x) - 28), textX, headY)
    ctx.fillStyle = 'rgba(226,232,240,0.75)'
    ctx.font = font(500, 25)
    ctx.fillText(fit(ctx, t.detail, w - 56), x + 28, y + tileH - 30)

    if (t.wide) {
      y += tileH + gap
    } else {
      slot++
      if (slot % 2 === 0) y += tileH + gap
    }
  }
}

// --- 3. power rankings --------------------------------------------------------

function drawPower(ctx: CanvasRenderingContext2D, family: string, data: RecapData) {
  const font = frame(ctx, family, data, weekTitle(data, 'Power Rankings'))
  const rows = data.power ?? []
  const col = { rank: PAD + 30, move: PAD + 48, team: PAD + 146, bar: PAD + 340, barW: 190, power: PAD + 590, record: PAD + 720, odds: PAD + 850, luck: W - PAD }

  const headY = TOP + 8
  ctx.fillStyle = MUTED
  ctx.font = font(700, 19)
  const label = (text: string, x: number, align: CanvasTextAlign) => {
    ctx.textAlign = align
    if (align === 'left') drawTracked(ctx, text, x, headY, 2)
    else ctx.fillText(text, x, headY)
    ctx.textAlign = 'left'
  }
  label('TEAM', col.team - 22, 'left')
  label('POWER', col.bar, 'left')
  label('RECORD', col.record, 'right')
  label('PLAYOFFS', col.odds, 'right')
  label('LUCK', col.luck, 'right')

  const top = headY + 18
  const footnotes = data.oddsNote ? 90 : 64
  const rowH = Math.min(60, (H - PAD - footnotes - top) / Math.max(rows.length, 1))
  const leader = Math.max(...rows.map((r) => r.power), 1)
  rows.forEach((r, i) => {
    const y = top + i * rowH
    const mid = y + rowH / 2 + 9
    ctx.fillStyle = MUTED
    ctx.font = font(500, 26)
    ctx.textAlign = 'right'
    ctx.fillText(String(r.rank), col.rank, mid)
    ctx.textAlign = 'left'

    // Movement since last week
    ctx.font = font(700, 20)
    if (r.move === null) {
      /* week 1: nothing to compare */
    } else if (r.move > 0) {
      ctx.fillStyle = GREEN
      ctx.fillText(`▲${r.move}`, col.move, mid - 1)
    } else if (r.move < 0) {
      ctx.fillStyle = RED
      ctx.fillText(`▼${-r.move}`, col.move, mid - 1)
    } else {
      ctx.fillStyle = MUTED
      ctx.fillText('–', col.move + 6, mid - 1)
    }

    dot(ctx, col.team - 14, mid - 9, 8, ownerColor(r.team))
    ctx.fillStyle = FG
    ctx.font = font(700, 29)
    ctx.fillText(fit(ctx, r.team, col.bar - col.team - 20), col.team, mid)

    // Power bar, scaled to the leader so the top team fills it
    const barY = mid - 16
    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)'
    roundRect(ctx, col.bar, barY, col.barW, 12, 6)
    ctx.fill()
    ctx.fillStyle = GREEN
    roundRect(ctx, col.bar, barY, Math.max(12, (col.barW * r.power) / leader), 12, 6)
    ctx.fill()
    ctx.fillStyle = FG
    ctx.font = font(800, 28)
    ctx.textAlign = 'right'
    ctx.fillText(String(r.power), col.power, mid)

    ctx.fillStyle = MUTED
    ctx.font = font(600, 26)
    ctx.fillText(r.record, col.record, mid)

    const odds = r.odds ?? '—'
    ctx.fillStyle = odds === 'IN' ? GREEN : odds === 'OUT' ? RED : r.odds ? FG : MUTED
    ctx.font = font(700, 26)
    ctx.fillText(odds, col.odds, mid)

    ctx.fillStyle = r.luck > 0 ? GREEN : r.luck < 0 ? RED : MUTED
    ctx.fillText(r.luck > 0 ? `+${r.luck}` : String(r.luck), col.luck, mid)
    ctx.textAlign = 'left'

    if (i < rows.length - 1) hline(ctx, PAD, W - PAD, y + rowH, LINE, 1)
  })

  ctx.fillStyle = MUTED
  ctx.font = font(500, 20)
  const legend = 'Power: scoring 50% · last 3 weeks 30% · record 20%  ·  Luck: H2H wins minus top-6 wins'
  ctx.fillText(fit(ctx, legend, W - 2 * PAD), PAD, H - PAD - 30)
  if (data.oddsNote) ctx.fillText(data.oddsNote, PAD, H - PAD - 56)
}

// --- canvas helpers ---------------------------------------------------------

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
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
