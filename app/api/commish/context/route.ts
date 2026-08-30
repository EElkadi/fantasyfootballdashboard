import { NextResponse } from 'next/server'
import { commishConfigured, isCommish } from '@/lib/commish/auth'
import { getRosters, getSeason } from '@/lib/data'
import { hasLiveSheet } from '@/lib/data/sheets'
import { ACTIVE_OWNERS, CURRENT_SEASON } from '@/lib/league'

export const dynamic = 'force-dynamic'

/** Everything the commissioner page needs to parse and review a submission. */
export async function GET() {
  if (!isCommish()) {
    return NextResponse.json({ authed: false, configured: commishConfigured() }, { status: 401 })
  }
  const [season, rosters] = await Promise.all([getSeason(CURRENT_SEASON), getRosters()])
  return NextResponse.json({
    authed: true,
    configured: true,
    sheetConfigured: hasLiveSheet(),
    season: CURRENT_SEASON,
    nextWeek: season.lastCompletedWeek + 1,
    teams: ACTIVE_OWNERS.map((o) => o.name),
    rosters,
    schedule: season.schedule,
  })
}
