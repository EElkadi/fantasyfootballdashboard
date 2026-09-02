import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { StandingsTable } from '@/components/league/StandingsTable'
import { TeamMark } from '@/components/league/TeamMark'
import { simulateSeason } from '@/lib/data/simulate'
import { playoffClinchStatus } from '@/lib/data/clinch'
import { CURRENT_SEASON, LEAGUE } from '@/lib/league'

export const revalidate = 60
export const metadata: Metadata = { title: 'Standings' }

export default async function StandingsPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()
  const regularSeasonDone = season.lastCompletedWeek >= LEAGUE.regularSeasonWeeks
  const sim = season.season === CURRENT_SEASON && !regularSeasonDone ? simulateSeason(season) : null
  const clinch = sim ? playoffClinchStatus(season) : null

  const powerRanked = [...season.standings].sort((a, b) => b.power - a.power)
  const luckiest = [...season.standings].sort((a, b) => b.luck - a.luck)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Standings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {season.season} season · through week {season.lastCompletedWeek}
          </p>
        </div>
        <div className="flex gap-1.5 text-sm">
          {availableSeasons().map((s) => (
            <Link
              key={s}
              href={`/standings?season=${s}`}
              className={`rounded-md px-2.5 py-1 font-medium ${
                s === season.season ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {season.standings.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No results yet — standings appear after Week 1 scores are entered.
        </p>
      ) : (
        <>
          <StandingsTable standings={season.standings} odds={sim?.odds ?? null} teamNames={season.teamNames} />

          {sim && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Playoff picture</h2>
              <p className="text-sm text-muted-foreground">
                From {sim.sims.toLocaleString()} simulations of the remaining {sim.weeksSimulated.length} week
                {sim.weeksSimulated.length === 1 ? '' : 's'}, using each team&apos;s scoring profile so far.
              </p>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Team</th>
                      <th className="px-3 py-2.5 text-right font-medium">Playoffs</th>
                      <th className="px-3 py-2.5 text-right font-medium">First-round bye</th>
                      <th className="px-3 py-2.5 text-right font-medium">#1 seed</th>
                      <th className="px-3 py-2.5 text-right font-medium">Turd Bowl</th>
                      <th className="px-3 py-2.5 text-right font-medium">Proj. wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.odds.map((o) => (
                      <tr key={o.team} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <TeamMark team={o.team} />
                            {clinch?.get(o.team) === 'clinched' && (
                              <span className="rounded bg-[hsl(var(--win))]/15 px-1.5 py-0.5 text-[10px] font-bold text-win">
                                CLINCHED
                              </span>
                            )}
                            {clinch?.get(o.team) === 'eliminated' && (
                              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-loss">
                                OUT
                              </span>
                            )}
                          </span>
                        </td>
                        <Pct value={o.playoffPct} strong />
                        <Pct value={o.byePct} />
                        <Pct value={o.topSeedPct} />
                        <Pct value={o.turdPct} danger />
                        <td className="tabular px-3 py-2.5 text-right">{o.avgWins.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Power rankings</h2>
              <p className="text-sm text-muted-foreground">
                Scoring strength (50%), form over the last three weeks (30%), record (20%).
              </p>
              <ol className="space-y-2">
                {powerRanked.map((s, i) => (
                  <li key={s.team} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm">
                    <span className="tabular w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                    <TeamMark team={s.team} className="flex-1" />
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, s.power)}%` }} />
                    </div>
                    <span className="tabular w-8 text-right text-sm font-semibold">{s.power}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Luck index</h2>
              <p className="text-sm text-muted-foreground">
                H2H wins minus top-6 wins. Positive = the schedule has been friendly; negative = good scores, brutal
                draws.
              </p>
              <ol className="space-y-2">
                {luckiest.map((s) => (
                  <li key={s.team} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm">
                    <TeamMark team={s.team} className="flex-1" />
                    <span className="text-xs text-muted-foreground">
                      {s.h2h.wins}-{s.h2h.losses} vs {s.top6.wins}-{s.top6.losses}
                    </span>
                    <span
                      className={`tabular w-10 text-right text-sm font-bold ${
                        s.luck > 0 ? 'text-win' : s.luck < 0 ? 'text-loss' : 'text-muted-foreground'
                      }`}
                    >
                      {s.luck > 0 ? `+${s.luck}` : s.luck}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Pct({ value, strong = false, danger = false }: { value: number; strong?: boolean; danger?: boolean }) {
  const text = value >= 99.95 ? '>99%' : value < 0.05 ? '—' : `${value.toFixed(0)}%`
  return (
    <td
      className={`tabular px-3 py-2.5 text-right ${
        strong ? 'font-semibold' : danger && value >= 30 ? 'text-loss' : 'text-muted-foreground'
      }`}
    >
      {text}
    </td>
  )
}
