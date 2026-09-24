import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { TRADES_TAB, describeSheetsError, hasLiveSheet } from '@/lib/data/sheets'
import { syncTradesToRosters } from '@/lib/data/tradeRosters'

export const dynamic = 'force-dynamic'

/** GET: which logged trades aren't reflected on the Rosters tab yet. */
export async function GET() {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ outcomes: [], pending: 0, applied: false })
  try {
    return NextResponse.json(await syncTradesToRosters({ apply: false }))
  } catch (err) {
    return NextResponse.json({ error: describeSheetsError(err, TRADES_TAB) }, { status: 502 })
  }
}

/** POST: move the players and stamp the trades. */
export async function POST() {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  try {
    const result = await syncTradesToRosters({ apply: true })
    revalidateTag('season-live')
    return NextResponse.json(result)
  } catch (err) {
    console.error('Trade sync failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, TRADES_TAB) }, { status: 502 })
  }
}
