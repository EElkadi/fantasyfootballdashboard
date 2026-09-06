import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import {
  DRAFT_TAB,
  GRADES_TAB,
  PLAYER_POOL_TAB,
  TEAMS_TAB,
  TRADES_TAB,
  columnLetter,
  describeSheetsError,
  hasLiveSheet,
  readTab,
  readTabOrEmpty,
  toObjects,
  updateCell,
} from '@/lib/data/sheets'
import {
  gridToDraft,
  nextDraftPick,
  parseDraftCell,
  pickTradeOwners,
  rowsToDraftOrder,
  rowsToGrades,
  rowsToPool,
  rowsToTrades,
  skippedCells,
} from '@/lib/data/transform'
import { samePlayer } from '@/lib/players'
import { addToRoster, removeFromRoster } from '@/lib/data/rosters'
import { LEAGUE, resolveOwner } from '@/lib/league'
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
async function readState(absent?: Set<string>): Promise<{ state: DraftState; board: string[][] } | { error: string }> {
  const [board, teamsRows, tradeRows] = await Promise.all([
    readTab(DRAFT_TAB).catch((err: unknown) => err),
    readTab(TEAMS_TAB).catch((err: unknown) => err),
    readTabOrEmpty(TRADES_TAB),
  ])
  if (!Array.isArray(teamsRows)) return { error: describeSheetsError(teamsRows, TEAMS_TAB) }
  // A board that can't be read must not be mistaken for a blank one — the
  // first pick would then fail at write time with a much less useful message
  if (!Array.isArray(board)) return { error: describeSheetsError(board, DRAFT_TAB) }
  const teamObjects = toObjects(teamsRows)

  const order = rowsToDraftOrder(teamObjects)
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
  // Pick swaps logged in the Trades tab ("Round 1, Pick 5") move the clock
  const owners = pickTradeOwners(rowsToTrades(toObjects(tradeRows)))
  const next = nextDraftPick(picks, order, LEAGUE.draftRounds, owners, absent)
  // Cells the draft has moved past without a pick (a manager who had to leave)
  const skipped = skippedCells(picks, order, LEAGUE.draftRounds, owners)
  return { state: { order, picks, next, rounds: LEAGUE.draftRounds, traded: Array.from(owners.entries()), skipped }, board }
}

/** "Kenny,Bala" or ["Kenny","Bala"] -> canonical owner names */
function parseAbsent(raw: unknown): Set<string> {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(',')
  return new Set(list.map((t) => resolveOwner(t.trim())?.name).filter((t): t is string => Boolean(t)))
}

export async function GET(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  // ?skip=Kenny,Bala — teams whose remaining picks the clock should jump over
  const absent = parseAbsent(new URL(req.url).searchParams.get('skip'))
  const [result, poolRows, gradeRows] = await Promise.all([
    readState(absent),
    readTabOrEmpty(PLAYER_POOL_TAB),
    readTabOrEmpty(GRADES_TAB),
  ])
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  // The pool and any saved grades ride along so the page has no second round trip
  return NextResponse.json({
    ...result.state,
    pool: rowsToPool(toObjects(poolRows)),
    grades: rowsToGrades(toObjects(gradeRows)),
  })
}

export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => ({}))
  // The clock must be computed with the same absent list the page showed,
  // or a pick meant for the next manager lands in the skipped one's cell
  const absent = parseAbsent(body?.skip)
  const result = await readState(absent)
  if ('error' in result) return NextResponse.json(result, { status: 400 })
  const { state, board } = result

  if (body?.undo === true) {
    // A specific cell (round + slot) when given — after a traded pick the
    // "last" cell by board order isn't necessarily the last one entered
    const last =
      body.round && body.slot
        ? state.picks.find((p) => p.round === Number(body.round) && p.slot === Number(body.slot))
        : state.picks[state.picks.length - 1]
    if (!last) return NextResponse.json({ error: 'Nothing to undo there' }, { status: 400 })
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

  // Default: the clock's cell. Override: a named team's column and a round,
  // for a swap the trade ledger doesn't know about yet.
  let { round, slot, team } = state.next
  const { overall } = state.next
  if (body?.team || body?.round) {
    const wantTeam = body.team ? String(body.team).trim() : team
    const wantRound = body.round ? Number(body.round) : round
    const col = state.order.find((o) => o.team.toLowerCase() === wantTeam.toLowerCase())
    if (!col) return NextResponse.json({ error: `No draft column for "${wantTeam}"` }, { status: 400 })
    if (!(wantRound >= 1 && wantRound <= state.rounds)) return NextResponse.json({ error: 'Round out of range' }, { status: 400 })
    team = col.team
    slot = col.slot
    round = wantRound
  }
  if (absent.has(team) && !(body?.team || body?.round)) {
    return NextResponse.json({ error: `${team} is marked absent — use "send it elsewhere" to fill their cell on purpose` }, { status: 409 })
  }
  if (state.picks.some((p) => p.round === round && p.slot === slot)) {
    return NextResponse.json(
      { error: `${team}'s round ${round} cell already has a player — pick a different round or undo it first` },
      { status: 409 },
    )
  }
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
