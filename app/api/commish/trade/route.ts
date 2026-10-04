import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { TRADES_TAB, describeSheetsError, hasLiveSheet } from '@/lib/data/sheets'
import { logTrade, syncTradesToRosters } from '@/lib/data/tradeRosters'
import { MAX_TRADE_TEAMS, parseTradeAsset } from '@/lib/data/transform'
import { resolveOwner } from '@/lib/league'
import { TradeParty } from '@/lib/types'

export const dynamic = 'force-dynamic'

function cleanAssets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((a) => String(a).trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 10)
}

/**
 * Log a two- or three-team trade: body `{ parties: [{ team, gets: string[] }] }`,
 * each party listing what it receives. Writes the deal to the Trades tab, then
 * moves its players between the Rosters columns and stamps it. Any asset that
 * isn't a draft pick is a player, with or without a team and position.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => null)
  const raw: unknown[] = Array.isArray(body?.parties) ? body.parties : []
  if (raw.length < 2 || raw.length > MAX_TRADE_TEAMS) {
    return NextResponse.json({ error: `A trade needs 2 to ${MAX_TRADE_TEAMS} teams` }, { status: 400 })
  }
  const parties: TradeParty[] = []
  for (const p of raw as { team?: unknown; gets?: unknown }[]) {
    const owner = resolveOwner(String(p?.team ?? ''))
    if (!owner) return NextResponse.json({ error: 'Pick every team in the trade' }, { status: 400 })
    if (parties.some((x) => x.team === owner.name)) {
      return NextResponse.json({ error: `${owner.name} is in the trade twice` }, { status: 400 })
    }
    const gets = cleanAssets(p?.gets).map(parseTradeAsset)
    if (gets.length === 0) return NextResponse.json({ error: `${owner.name} must receive at least one asset` }, { status: 400 })
    parties.push({ team: owner.name, gets })
  }

  let firstRow: number
  try {
    firstRow = await logTrade(parties)
  } catch (err) {
    console.error('Trade write failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, TRADES_TAB) }, { status: 502 })
  }

  // Move only this deal's players; older unstamped deals wait for the
  // commissioner to review them in the pending-trades banner. The trade is
  // saved either way, so roster trouble is reported, not fatal.
  let sync = null
  let rosterError: string | null = null
  try {
    sync = await syncTradesToRosters({ apply: true, only: (t) => t.row === firstRow })
  } catch (err) {
    console.error('Trade roster sync failed:', err)
    rosterError = `Trade saved, but the rosters couldn't be updated: ${describeSheetsError(err, TRADES_TAB)}. Use "Apply to rosters" on this page to retry.`
  }

  revalidateTag('season-live')
  return NextResponse.json({
    ok: true,
    teams: parties.map((p) => p.team),
    moved: sync?.outcomes.flatMap((o) => o.moved) ?? [],
    missing: sync?.outcomes.flatMap((o) => o.missing) ?? [],
    rosterError,
  })
}
