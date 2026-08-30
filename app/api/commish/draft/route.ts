import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { DRAFT_TAB, TEAMS_TAB, columnLetter, hasLiveSheet, readTab, toObjects, updateCell } from '@/lib/data/sheets'
import { gridToDraft, snakePosition } from '@/lib/data/transform'
import { LEAGUE } from '@/lib/league'
import { DraftState } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Column letter for a draft slot (col A holds round labels, slots start at B). */
function slotColumn(slot: number): string {
  return columnLetter(slot + 1)
}

/**
 * 1-based sheet row for a round: reuse the row that already carries the
 * round's label; otherwise extrapolate from any labeled round so reads and
 * writes always agree, even on a board with extra rows above the grid.
 * A completely blank board starts at row 2 (row 1 is left for a header).
 */
function roundRow(board: string[][], round: number): number {
  let anchor: { row: number; round: number } | null = null
  for (let i = 0; i < board.length; i++) {
    const m = (board[i][0] ?? '').match(/round\s*0*(\d+)/i)
    if (!m) continue
    const r = parseInt(m[1])
    if (r === round) return i + 1
    if (!anchor) anchor = { row: i + 1, round: r }
  }
  return anchor ? anchor.row + (round - anchor.round) : round + 1
}

/**
 * Live state derived from the sheet every time — restart-safe and shareable
 * across devices. The next pick is the first empty snake position.
 */
async function readState(): Promise<{ state: DraftState; board: string[][] } | { error: string }> {
  const [board, teamsRows] = await Promise.all([
    readTab(DRAFT_TAB).catch(() => null),
    readTab(TEAMS_TAB).catch(() => null),
  ])
  if (!teamsRows) return { error: `Couldn't read the "${TEAMS_TAB}" tab` }
  const teamObjects = toObjects(teamsRows)

  const order: DraftState['order'] = []
  for (const r of teamObjects) {
    const slot = parseInt(r['DRAFT ORDER'] ?? '')
    const team = (r['TEAMS'] ?? '').trim()
    if (slot && team) order.push({ slot, team })
  }
  order.sort((a, b) => a.slot - b.slot)
  const teams = order.length
  if (teams === 0) {
    return { error: `The "${TEAMS_TAB}" tab needs DRAFT ORDER and TEAMS columns filled in before the draft` }
  }
  if (order.some((o, i) => o.slot !== i + 1)) {
    return {
      error: `The "${TEAMS_TAB}" tab's DRAFT ORDER must run 1–${teams} with no gaps or repeats (found: ${order.map((o) => o.slot).join(', ')})`,
    }
  }

  const picks = gridToDraft(board ?? [], teamObjects)
  const taken = new Set(picks.map((p) => `${p.round}|${p.slot}`))
  let next: DraftState['next'] = null
  for (let overall = 1; overall <= LEAGUE.draftRounds * teams; overall++) {
    const { round, slot } = snakePosition(overall, teams)
    if (!taken.has(`${round}|${slot}`)) {
      next = { round, slot, overall, team: order[slot - 1].team }
      break
    }
  }
  return { state: { order, picks, next, rounds: LEAGUE.draftRounds }, board: board ?? [] }
}

export async function GET() {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  const result = await readState()
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result.state)
}

export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => ({}))
  const result = await readState()
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  const { state, board } = result

  if (body?.undo === true) {
    const last = state.picks[state.picks.length - 1]
    if (!last) return NextResponse.json({ error: 'Nothing to undo' }, { status: 400 })
    try {
      await updateCell(DRAFT_TAB, `${slotColumn(last.slot)}${roundRow(board, last.round)}`, '')
    } catch (err) {
      console.error('Draft undo failed:', err)
      return NextResponse.json({ error: 'Clearing the cell failed — try again' }, { status: 502 })
    }
    revalidateTag('season-live')
    return NextResponse.json({ ok: true, undone: last })
  }

  const player = String(body?.player ?? '').trim().replace(/\s+/g, ' ')
  if (!player) return NextResponse.json({ error: 'Player is required' }, { status: 400 })
  if (!state.next) return NextResponse.json({ error: 'The draft board is full' }, { status: 400 })

  const { round, slot, overall, team } = state.next
  const row = roundRow(board, round)
  try {
    // Round label first (idempotent), then the pick itself
    await updateCell(DRAFT_TAB, `A${row}`, `Round ${String(round).padStart(2, '0')}`)
    await updateCell(DRAFT_TAB, `${slotColumn(slot)}${row}`, player)
  } catch (err) {
    console.error('Draft pick write failed:', err)
    return NextResponse.json({ error: 'Writing the pick failed — try again' }, { status: 502 })
  }
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, round, slot, overall, team, player })
}
