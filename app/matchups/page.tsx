import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { MatchupCard } from '@/components/league/MatchupCard'
import { TeamMark } from '@/components/league/TeamMark'
import { LEAGUE } from '@/lib/league'

export const revalidate = 60
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

  const allWeeks = new Set<number>([
    ...season.weeks,
    ...season.schedule.filter((s) => s.week <= LEAGUE.regularSeasonWeeks).map((s) => s.week),
  ])
  const weekLink = (w: number) =>
    `/matchups?week=${w}${seasonParam ? `&season=${seasonParam}` : ''}`

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Matchups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {season.season} season{scheduleWeek?.label ? ` · ${scheduleWeek.label}` : ''}
          </p>
        </div>
        <SeasonSwitcher current={season.season} basePath="/matchups" />
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {Array.from(allWeeks)
          .sort((a, b) => a - b)
          .map((w) => (
            <Link
              key={w}
              href={weekLink(w)}
              className={`tabular rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                w === week
                  ? 'bg-primary text-primary-foreground'
                  : w <= latest
                    ? 'bg-secondary text-foreground hover:bg-secondary/70'
                    : 'border border-dashed text-muted-foreground hover:bg-secondary/50'
              }`}
            >
              {w}
            </Link>
          ))}
      </nav>

      {matchups.length > 0 ? (
        <div className="space-y-3">
          {matchups.map((m, i) => (
            <MatchupCard key={i} matchup={m} defaultOpen={matchups.length === 1} />
          ))}
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

function SeasonSwitcher({ current, basePath }: { current: number; basePath: string }) {
  const seasons = availableSeasons()
  if (seasons.length < 2) return null
  return (
    <div className="flex gap-1.5 text-sm">
      {seasons.map((s) => (
        <Link
          key={s}
          href={`${basePath}?season=${s}`}
          className={`rounded-md px-2.5 py-1 font-medium ${
            s === current ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {s}
        </Link>
      ))}
    </div>
  )
}
