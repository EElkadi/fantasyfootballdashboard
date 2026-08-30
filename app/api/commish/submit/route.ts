import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { appendRow, hasLiveSheet, SCORES_TAB } from '@/lib/data/sheets'
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

  const total = (l: SubmitLineup) => l.players.reduce((s, p) => s + p.score, 0)
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
    return NextResponse.json({ error: 'Writing to the Google Sheet failed — try again' }, { status: 502 })
  }
  revalidateTag('season-live')

  return NextResponse.json({ ok: true, week, team1, team2, total1, total2, winner, loser, tiebreaker: tiebreaker ?? null })
}
