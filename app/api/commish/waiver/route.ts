import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { appendRow, hasLiveSheet, WAIVERS_TAB } from '@/lib/data/sheets'
import { addToRoster } from '@/lib/data/rosters'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/** Log one waiver add to the Waiver Wire tab: WEEK | TEAM | PLAYER | COST */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) {
    return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  }
  const body = await req.json().catch(() => null)
  const week = Number(body?.week)
  const owner = resolveOwner(String(body?.team ?? ''))
  const player = String(body?.player ?? '').trim()
  const cost = Number(body?.cost)
  if (!week || week < 1 || week > 18) return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  if (!owner) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })
  if (!player) return NextResponse.json({ error: 'Player is required' }, { status: 400 })
  if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: 'Invalid fee' }, { status: 400 })

  try {
    await appendRow(WAIVERS_TAB, [week, owner.name, player, cost])
  } catch (err) {
    console.error('Waiver append failed:', err)
    return NextResponse.json({ error: 'Writing to the Google Sheet failed — try again' }, { status: 502 })
  }
  // Keep the Rosters tab (and the parser's name matching) current
  const rosterWarning = await addToRoster(owner.name, player)
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, week, team: owner.name, player, cost, warning: rosterWarning })
}
