import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAllSeasons, getDefaultSeason } from '@/lib/data'
import { buildRecordBook, careerHeadToHead } from '@/lib/data/records'
import { careerSummary, trophyCase } from '@/lib/data/career'
import { LEAGUE, resolveOwner, teamNameOf, ownerColor } from '@/lib/league'
import { ScoresChart, SeriesPoint } from '@/components/league/ScoresChart'
import { playerSlug } from '@/lib/players'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60

export function generateMetadata({ params }: { params: { team: string } }): Metadata {
  const owner = resolveOwner(decodeURIComponent(params.team))
  return { title: owner ? `${teamNameOf(owner.name)} (${owner.name})` : 'Team' }
}

export default async function TeamPage({ params }: { params: { team: string } }) {
  const owner = resolveOwner(decodeURIComponent(params.team))
  if (!owner) notFound()

  const [season, allSeasons] = await Promise.all([getDefaultSeason(), getAllSeasons()])
  const team = owner.name
  const standing = season.standings.find((s) => s.team === team)
  const results = season.teamWeeks.filter((r) => r.team === team).sort((a, b) => a.week - b.week)

  // Chart series: this team vs weekly league average
  const chartData: SeriesPoint[] = season.weeks.map((week) => {
    const row = results.find((r) => r.week === week)
    return { week, [team]: row?.score ?? 0 }
  })
  const leagueAvg: Record<number, number> = {}
  for (const week of season.weeks) {
    const rows = season.teamWeeks.filter((r) => r.week === week)
    leagueAvg[week] = rows.reduce((s, r) => s + r.score, 0) / Math.max(1, rows.length)
  }

  // Season contributors
  const contributions = new Map<string, { player: string; weeks: number; total: number; slots: Set<string> }>()
  for (const p of season.playerWeeks.filter((p) => p.team === team)) {
    if (!contributions.has(p.player)) contributions.set(p.player, { player: p.player, weeks: 0, total: 0, slots: new Set() })
    const c = contributions.get(p.player)!
    c.weeks++
    c.total += p.score
    c.slots.add(p.slot.replace(/\d$/, ''))
  }
  const contributors = Array.from(contributions.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  const h2h = careerHeadToHead(allSeasons, team)
  const career = careerSummary(allSeasons, team)
  const trophies = trophyCase(team, buildRecordBook(allSeasons))
  const seasonHistory = allSeasons
    .map((s) => ({ season: s.season, standing: s.standings.find((x) => x.team === team) }))
    .filter((s) => s.standing)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section className="flex flex-wrap items-center gap-4">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-extrabold text-white shadow-sm"
          style={{ backgroundColor: ownerColor(team) }}
        >
          {team[0]}
        </span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{teamNameOf(team)}</h1>
          <p className="text-muted-foreground">
            {team}
            {standing &&
              ` · #${standing.rank} in ${season.season} · ${standing.overall.wins}-${standing.overall.losses} overall`}
          </p>
        </div>
      </section>

      {standing && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="H2H" value={`${standing.h2h.wins}-${standing.h2h.losses}`} />
          <Stat label="Top 6" value={`${standing.top6.wins}-${standing.top6.losses}`} />
          <Stat label="Points/week" value={standing.avgPointsFor.toFixed(1)} />
          <Stat
            label="Point diff"
            value={`${standing.diff > 0 ? '+' : ''}${standing.diff.toLocaleString()}`}
            tone={standing.diff > 0 ? 'win' : standing.diff < 0 ? 'loss' : undefined}
          />
          <Stat label="Streak" value={standing.streak} tone={standing.streak.startsWith('W') ? 'win' : 'loss'} />
          <Stat
            label="Luck"
            value={standing.luck > 0 ? `+${standing.luck}` : `${standing.luck}`}
            tone={standing.luck > 0 ? 'win' : standing.luck < 0 ? 'loss' : undefined}
            hint="H2H minus top-6 wins"
          />
        </section>
      )}

      {career && career.seasons > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Career</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Seasons" value={String(career.seasons)} />
            <Stat
              label="Record"
              value={`${career.overall.wins}-${career.overall.losses}`}
              hint={`${(career.winPct * 100).toFixed(0)}% overall · ${career.h2h.wins}-${career.h2h.losses} head-to-head`}
              tone={career.winPct > 0.5 ? 'win' : career.winPct < 0.5 ? 'loss' : undefined}
            />
            <Stat label="Points/week" value={career.avgPointsFor.toFixed(1)} hint="Career average" />
            <Stat label="Playoffs" value={`${career.playoffAppearances}×`} hint={`Top-${LEAGUE.playoffTeams} finishes in completed seasons`} />
            <Stat
              label="Best finish"
              value={career.bestFinish ? `#${career.bestFinish.rank}` : '—'}
              hint={career.bestFinish ? `Regular season, ${career.bestFinish.season}` : undefined}
            />
            <Stat
              label="Best week"
              value={career.bestWeek ? String(career.bestWeek.score) : '—'}
              hint={career.bestWeek ? `Week ${career.bestWeek.week}, ${career.bestWeek.season}` : undefined}
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Trophy case</h2>
        {trophies.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trophies.map((t, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                  t.tier === 'honor' ? 'bg-primary/5 border-primary/30' : 'bg-card'
                }`}
              >
                <span aria-hidden className="text-2xl leading-none">
                  {t.emoji}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{t.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Empty. Championships, scoring titles, Turds and any record-book entry land here.
          </p>
        )}
      </section>

      {results.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Week by week — {season.season}</h2>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <ScoresChart data={chartData} teams={[team]} leagueAvg={leagueAvg} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {results.map((r) => (
              <Link
                key={r.week}
                href={`/matchups?week=${r.week}${season.season !== undefined ? `&season=${season.season}` : ''}`}
                title={`Week ${r.week}: ${r.score} vs ${r.opponent}`}
                className={`tabular rounded-md px-2 py-1 text-xs font-semibold text-white ${
                  r.result === 'Win' ? 'bg-[hsl(var(--win))]' : 'bg-[hsl(var(--loss))]'
                }`}
              >
                W{r.week} {r.result === 'Win' ? 'W' : 'L'} {r.score}–
                {season.teamWeeks.find((o) => o.week === r.week && o.team === r.opponent)?.score ?? '?'}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {contributors.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">Top contributors</h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Player</th>
                    <th className="px-3 py-2 font-medium">Slot</th>
                    <th className="px-3 py-2 text-right font-medium">Starts</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {contributors.map((c) => (
                    <tr key={c.player} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/players/${playerSlug(c.player)}?season=${season.season}`} className="hover:underline">
                          {c.player}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{Array.from(c.slots).join(', ')}</td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">{c.weeks}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{c.total}</td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">
                        {(c.total / c.weeks).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="space-y-6">
          {h2h.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Head-to-head, all time</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {h2h.map((r) => (
                  <div key={r.opponent} className="rounded-lg border bg-card px-3 py-2 shadow-sm">
                    <TeamMark team={r.opponent} className="text-sm" />
                    <p
                      className={`tabular mt-1 text-lg font-bold ${
                        r.wins > r.losses ? 'text-win' : r.wins < r.losses ? 'text-loss' : ''
                      }`}
                    >
                      {r.wins}-{r.losses}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {seasonHistory.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Season history</h2>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Season</th>
                      <th className="px-3 py-2 text-right font-medium">Finish</th>
                      <th className="px-3 py-2 text-right font-medium">Overall</th>
                      <th className="px-3 py-2 text-right font-medium">PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonHistory.map(({ season: yr, standing: s }) => (
                      <tr key={yr} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2 font-medium">{yr}</td>
                        <td className="tabular px-3 py-2 text-right">#{s!.rank}</td>
                        <td className="tabular px-3 py-2 text-right">
                          {s!.overall.wins}-{s!.overall.losses}
                        </td>
                        <td className="tabular px-3 py-2 text-right text-muted-foreground">
                          {s!.pointsFor.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'win' | 'loss'; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm" title={hint}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`tabular mt-1 text-xl font-bold ${tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : ''}`}>
        {value}
      </p>
    </div>
  )
}
