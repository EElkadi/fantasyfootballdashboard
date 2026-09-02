import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { TRADES_TAB, appendRow, describeSheetsError, hasLiveSheet } from '@/lib/data/sheets'
import { addToRoster, removeFromRoster } from '@/lib/data/rosters'
import { parseDraftCell } from '@/lib/data/transform'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

function cleanAssets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((a) => String(a).trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 10)
}

/** An asset is a player (vs a pick swap) when it parses with a real position. */
function asPlayer(asset: string): string | null {
  const parsed = parseDraftCell(asset)
  return parsed.position ? asset : null
}

/**
 * Log a trade: append rows to the Trades tab in its historical layout
 * (first row names both teams, continuation rows carry extra assets), then
 * best-effort move the player assets between the two Rosters columns.
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
  try {
    for (let i = 0; i < rowCount; i++) {
      await appendRow(TRADES_TAB, [
        i === 0 ? team1.name : '',
        team1Gets[i] ?? '',
        i === 0 ? team2.name : '',
        team2Gets[i] ?? '',
      ])
    }
  } catch (err) {
    console.error('Trade append failed:', err)
    return NextResponse.json(
      { error: `${describeSheetsError(err, TRADES_TAB)} (the tab needs TEAM 1 | TEAM 1 GETS | TEAM 2 | TEAM 2 GETS)` },
      { status: 502 },
    )
  }

  // Move player assets between rosters; pick swaps have no roster effect.
  const warnings: string[] = []
  const move = async (player: string, from: string, to: string) => {
    for (const warning of [await removeFromRoster(from, player), await addToRoster(to, player)]) {
      if (warning) warnings.push(warning)
    }
  }
  for (const asset of team1Gets) {
    const player = asPlayer(asset)
    if (player) await move(player, team2.name, team1.name)
  }
  for (const asset of team2Gets) {
    const player = asPlayer(asset)
    if (player) await move(player, team1.name, team2.name)
  }

  revalidateTag('season-live')
  return NextResponse.json({ ok: true, team1: team1.name, team2: team2.name, warnings })
}
