import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { ADJUSTMENTS_TAB, appendRow, describeSheetsError, hasLiveSheet, SCORES_TAB } from '@/lib/data/sheets'
import { decideWinner } from '@/lib/parser/parse'
import { resolveOwner } from '@/lib/league'
import { Slot, SLOTS } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface SubmitPlayer {
  slot: Slot
  name: string
  score: number
}

interface SubmitLineup {
  team: string
  players: SubmitPlayer[]
  /** Point adjustment to the official total (e.g. -5 confirmation penalty) */
  penalty?: number
}

function validateLineup(l: SubmitLineup): string | null {
  const owner = resolveOwner(l.team)
  if (!owner) return `Unknown team "${l.team}"`
  for (const slot of SLOTS) {
    const p = l.players.find((x) => x.slot === slot)
    if (!p) return `${owner.name}: missing ${slot}`
    if (!p.name.trim()) return `${owner.name}: ${slot} has no player name`
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) return `${owner.name}: ${slot} has no score`
  }
  return null
}

/**
 * Append one matchup to the Scores tab in its historical 43-column format:
 * Week, Team 1, <name,score per slot>, Total1, Team 2, <...>, Total2, Winner, Loser.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) {
    return NextResponse.json(
      { error: 'Google Sheet is not configured (set LEAGUE_SHEET_ID and service account credentials)' },
      { status: 501 },
    )
  }

  const body = await req.json().catch(() => null)
  const week = Number(body?.week)
  const lineups = body?.lineups as SubmitLineup[] | undefined
  if (!week || week < 1 || week > 18) return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  if (!lineups || lineups.length !== 2) return NextResponse.json({ error: 'Expected exactly two lineups' }, { status: 400 })

  for (const l of lineups) {
    const err = validateLineup(l)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const [l1, l2] = lineups
  const team1 = resolveOwner(l1.team)!.name
  const team2 = resolveOwner(l2.team)!.name
  if (team1 === team2) return NextResponse.json({ error: 'A team cannot play itself' }, { status: 400 })

  // Official totals include any penalty; the box score keeps raw player points
  const total = (l: SubmitLineup) => l.players.reduce((s, p) => s + p.score, 0) + (Number(l.penalty) || 0)
  const slotScore = (l: SubmitLineup) => (slot: Slot) => l.players.find((p) => p.slot === slot)?.score ?? 0
  const total1 = total(l1)
  const total2 = total(l2)
  const { winner, loser, tiebreaker } = decideWinner(
    { team: team1, total: total1, slotScore: slotScore(l1) },
    { team: team2, total: total2, slotScore: slotScore(l2) },
  )

  const slotCells = (l: SubmitLineup) =>
    SLOTS.flatMap((slot) => {
      const p = l.players.find((x) => x.slot === slot)!
      return [p.name.trim(), p.score]
    })

  const row: (string | number)[] = [week, team1, ...slotCells(l1), total1, team2, ...slotCells(l2), total2, winner, loser]

  try {
    await appendRow(SCORES_TAB, row)
  } catch (err) {
    console.error('Sheet append failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, SCORES_TAB) }, { status: 502 })
  }

  // Log penalties to the Adjustments tab so the site can show the reason.
  // Best-effort: the score row is already saved either way.
  let adjustmentWarning: string | null = null
  for (const [l, teamName] of [
    [l1, team1],
    [l2, team2],
  ] as const) {
    const penalty = Number(l.penalty) || 0
    if (penalty === 0) continue
    const reason = penalty === -5 ? 'Late confirmation penalty (§VII)' : 'Commissioner score adjustment'
    try {
      await appendRow(ADJUSTMENTS_TAB, [week, teamName, penalty, reason])
    } catch (err) {
      console.error('Adjustments append failed:', err)
      adjustmentWarning = `Saved the matchup, but couldn't log the ${teamName} adjustment: ${describeSheetsError(err, ADJUSTMENTS_TAB)}`
    }
  }
  revalidateTag('season-live')

  return NextResponse.json({
    ok: true,
    week,
    team1,
    team2,
    total1,
    total2,
    winner,
    loser,
    tiebreaker: tiebreaker ?? null,
    warning: adjustmentWarning,
  })
}
