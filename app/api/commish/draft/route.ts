import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import {
  DRAFT_TAB,
  PLAYER_POOL_TAB,
  TEAMS_TAB,
  columnLetter,
  describeSheetsError,
  hasLiveSheet,
  readTab,
  readTabOrEmpty,
  toObjects,
  updateCell,
} from '@/lib/data/sheets'
import { gridToDraft, parseDraftCell, rowsToPool, snakePosition } from '@/lib/data/transform'
import { samePlayer } from '@/lib/players'
import { addToRoster, removeFromRoster } from '@/lib/data/rosters'
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
    readTab(DRAFT_TAB).catch((err: unknown) => err),
    readTab(TEAMS_TAB).catch((err: unknown) => err),
  ])
  if (!Array.isArray(teamsRows)) return { error: describeSheetsError(teamsRows, TEAMS_TAB) }
  // A board that can't be read must not be mistaken for a blank one — the
  // first pick would then fail at write time with a much less useful message
  if (!Array.isArray(board)) return { error: describeSheetsError(board, DRAFT_TAB) }
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

  const picks = gridToDraft(board, teamObjects)
  const taken = new Set(picks.map((p) => `${p.round}|${p.slot}`))
  let next: DraftState['next'] = null
  for (let overall = 1; overall <= LEAGUE.draftRounds * teams; overall++) {
    const { round, slot } = snakePosition(overall, teams)
    if (!taken.has(`${round}|${slot}`)) {
      next = { round, slot, overall, team: order[slot - 1].team }
      break
    }
  }
  return { state: { order, picks, next, rounds: LEAGUE.draftRounds }, board }
}

export async function GET() {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  const [result, poolRows] = await Promise.all([readState(), readTabOrEmpty(PLAYER_POOL_TAB)])
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  // The pool rides along so the typeahead has no second round trip
  return NextResponse.json({ ...result.state, pool: rowsToPool(toObjects(poolRows)) })
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
      return NextResponse.json({ error: describeSheetsError(err, DRAFT_TAB) }, { status: 502 })
    }
    const warning = await removeFromRoster(last.team, last.player)
    revalidateTag('season-live')
    return NextResponse.json({ ok: true, undone: last, warning })
  }

  const player = String(body?.player ?? '').trim().replace(/\s+/g, ' ')
  if (!player) return NextResponse.json({ error: 'Player is required' }, { status: 400 })
  if (!state.next) return NextResponse.json({ error: 'The draft board is full' }, { status: 400 })
  const ref = parseDraftCell(player)
  const dupe = state.picks.find((p) => samePlayer(p, ref))
  if (dupe) {
    return NextResponse.json(
      { error: `${dupe.player} is already on ${dupe.team}'s board (round ${dupe.round}). Different player with that name? Include the NFL team.` },
      { status: 409 },
    )
  }

  const { round, slot, overall, team } = state.next
  const row = roundRow(board, round)
  try {
    // Round label first (idempotent), then the pick itself
    await updateCell(DRAFT_TAB, `A${row}`, `Round ${String(round).padStart(2, '0')}`)
    await updateCell(DRAFT_TAB, `${slotColumn(slot)}${row}`, player)
  } catch (err) {
    console.error('Draft pick write failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, DRAFT_TAB) }, { status: 502 })
  }
  // The Rosters tab (public /rosters, parser name matching) builds itself
  // from the picks. Best effort: a roster hiccup never fails the pick.
  const warning = await addToRoster(team, player)
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, round, slot, overall, team, player, warning })
}
