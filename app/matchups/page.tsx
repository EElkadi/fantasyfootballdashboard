import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { MatchupCard } from '@/components/league/MatchupCard'
import { PageHeader } from '@/components/league/PageHeader'
import { SeasonTabs } from '@/components/league/SeasonTabs'
import { TeamMark } from '@/components/league/TeamMark'
import { WeekNav } from '@/components/league/WeekNav'
import { LEAGUE } from '@/lib/league'

// Rendered per request from the 60-second data cache — never a build-time snapshot
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Matchups' }

export default async function MatchupsPage({
  searchParams,
}: {
  searchParams: { week?: string; season?: string }
}) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()

  const latest = season.lastCompletedWeek
  const week = searchParams.week ? parseInt(searchParams.week) : latest || 1
  const matchups = season.matchups.filter((m) => m.week === week)
  const scheduleWeek = season.schedule.find((s) => s.week === week)

  // Scheduled-but-unplayed pairings
  const upcoming: [string, string][] = []
  if (matchups.length === 0 && scheduleWeek) {
    const seen = new Set<string>()
    for (const [team, opp] of Object.entries(scheduleWeek.opponents)) {
      if (seen.has(team) || seen.has(opp)) continue
      seen.add(team)
      seen.add(opp)
      upcoming.push([team, opp])
    }
  }

  const allWeeks = [
    ...season.weeks,
    ...season.schedule.filter((s) => s.week <= LEAGUE.regularSeasonWeeks).map((s) => s.week),
  ]
  const weekLink = (w: number) =>
    `/matchups?week=${w}${seasonParam ? `&season=${seasonParam}` : ''}`

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeader
        title="Matchups"
        description={`${season.season} season${(() => {
          const label = scheduleWeek?.label ?? LEAGUE.playoffWeekLabels[week]
          return label ? ` · ${label}` : ''
        })()}`}
        actions={<SeasonTabs seasons={availableSeasons()} current={season.season} href={(s) => `/matchups?season=${s}`} />}
      />

      <WeekNav weeks={allWeeks} current={week} latest={latest} href={weekLink} />

      {matchups.length > 0 ? (
        <div className="space-y-4">
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {matchups.map((m, i) => (
              <MatchupCard key={i} matchup={m} defaultOpen={matchups.length === 1} season={season.season} />
            ))}
          </div>
          {!seasonParam && (
            <p className="text-sm">
              <Link href={`/recap/${week}`} className="font-medium text-primary hover:underline">
                Share the week {week} recap card →
              </Link>
            </p>
          )}
        </div>
      ) : upcoming.length > 0 ? (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Scheduled — no scores yet</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {upcoming.map(([a, b]) => (
              <li key={a} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                <TeamMark team={a} />
                <span className="text-xs text-muted-foreground">vs</span>
                <TeamMark team={b} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Nothing for week {week}.</p>
      )}
    </div>
  )
}
