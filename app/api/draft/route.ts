import { NextResponse } from 'next/server'
import { getSeason } from '@/lib/data'
import { CURRENT_SEASON, LEAGUE } from '@/lib/league'
import { nextDraftPick } from '@/lib/data/transform'

export const dynamic = 'force-dynamic'

/**
 * Public draft state for the personal draft board: picks so far, the player
 * pool, and whether the draft is still going. Backed by the same 60-second
 * season cache every page uses, which each saved pick revalidates.
 */
export async function GET() {
  const season = await getSeason(CURRENT_SEASON)
  const live =
    season.lastCompletedWeek === 0 &&
    season.draft.length < LEAGUE.draftRounds * Math.max(1, season.teams.length)
  const next = live ? nextDraftPick(season.draft, season.draftOrder, LEAGUE.draftRounds) : null
  return NextResponse.json(
    {
      season: season.season,
      live,
      picks: season.draft,
      pool: season.pool,
      order: season.draftOrder,
      rounds: LEAGUE.draftRounds,
      next,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
