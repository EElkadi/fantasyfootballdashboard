import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { TRADES_TAB, appendRows, describeSheetsError, hasLiveSheet } from '@/lib/data/sheets'
import { syncTradesToRosters } from '@/lib/data/tradeRosters'
import type { LoggedTrade } from '@/lib/data/tradeSync'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

function cleanAssets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((a) => String(a).trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 10)
}

/**
 * Log a trade: append rows to the Trades tab in its historical layout
 * (first row names both teams, continuation rows carry extra assets), then
 * move this trade's players between the Rosters columns and stamp it. Any
 * asset that isn't a draft pick is a player, with or without a team and
 * position after the name.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => null)
  const team1 = resolveOwner(String(body?.team1 ?? ''))
  const team2 = resolveOwner(String(body?.team2 ?? ''))
  const team1Gets = cleanAssets(body?.team1Gets)
  const team2Gets = cleanAssets(body?.team2Gets)

  if (!team1 || !team2) return NextResponse.json({ error: 'Pick both teams' }, { status: 400 })
  if (team1.name === team2.name) return NextResponse.json({ error: 'A team cannot trade with itself' }, { status: 400 })
  if (team1Gets.length === 0 || team2Gets.length === 0) {
    return NextResponse.json({ error: 'Both sides must receive at least one asset' }, { status: 400 })
  }

  const rowCount = Math.max(team1Gets.length, team2Gets.length)
  const rows = Array.from({ length: rowCount }, (_, i) => [
    i === 0 ? team1.name : '',
    team1Gets[i] ?? '',
    i === 0 ? team2.name : '',
    team2Gets[i] ?? '',
  ])
  let firstRow: number | undefined
  try {
    // One request keeps a multi-asset trade's rows together
    firstRow = await appendRows(TRADES_TAB, rows)
  } catch (err) {
    console.error('Trade append failed:', err)
    return NextResponse.json(
      { error: `${describeSheetsError(err, TRADES_TAB)} (the tab needs TEAM 1 | TEAM 1 GETS | TEAM 2 | TEAM 2 GETS)` },
      { status: 502 },
    )
  }

  // Move only this trade's players. Older unstamped trades wait for the
  // commissioner to review them in the pending-trades banner. The trade is
  // saved either way; roster trouble is reported, not fatal.
  let sync = null
  let rosterError: string | null = null
  if (firstRow === undefined) {
    rosterError = 'Trade saved. Use "Apply to rosters" on this page to move the players.'
  } else {
    try {
      sync = await syncTradesToRosters({ apply: true, only: (t: LoggedTrade) => t.row === firstRow })
    } catch (err) {
      console.error('Trade roster sync failed:', err)
      rosterError = `Trade saved, but the rosters couldn't be updated: ${describeSheetsError(err, TRADES_TAB)}. Use "Apply to rosters" on this page to retry.`
    }
  }

  revalidateTag('season-live')
  return NextResponse.json({
    ok: true,
    team1: team1.name,
    team2: team2.name,
    moved: sync?.outcomes.flatMap((o) => o.moved) ?? [],
    missing: sync?.outcomes.flatMap((o) => o.missing) ?? [],
    rosterError,
  })
}
