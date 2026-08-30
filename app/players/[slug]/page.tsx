import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAllSeasons } from '@/lib/data'
import { playerSeasonSummary, PlayerSeasonSummary } from '@/lib/data/playerStats'
import { positionColor } from '@/lib/players'
import { ScoresChart, SeriesPoint } from '@/components/league/ScoresChart'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  return { title: decodeURIComponent(params.slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { season?: string }
}) {
  const slug = decodeURIComponent(params.slug)
  const seasons = await getAllSeasons()
  const summaries = seasons
    .map((s) => playerSeasonSummary(s, slug))
    .filter((s): s is PlayerSeasonSummary => s !== null)
  if (summaries.length === 0) notFound()

  const requested = searchParams.season ? parseInt(searchParams.season) : undefined
  const summary = summaries.find((s) => s.season === requested) ?? summaries[0]

  const chartData: SeriesPoint[] = summary.games.map((g) => ({ week: g.week, [summary.name]: g.score }))
  const color = positionColor(summary.position)

  const ordinal = (n: number) =>
    `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {summary.position ?? '?'}
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{summary.name}</h1>
            <p className="text-muted-foreground">
              {[summary.position, summary.nflTeam, `${summary.season} season`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {summaries.length > 1 && (
          <div className="flex gap-1.5 text-sm">
            {summaries.map((s) => (
              <Link
                key={s.season}
                href={`/players/${params.slug}?season=${s.season}`}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  s.season === summary.season
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.season}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Starts" value={String(summary.starts)} />
        <Stat label="Total pts" value={summary.total.toLocaleString()} />
        <Stat label="Avg / start" value={summary.avg.toFixed(1)} />
        <Stat label="Best week" value={summary.best ? `${summary.best.score}` : '—'} hint={summary.best ? `Week ${summary.best.week} for ${summary.best.team}` : undefined} />
        <Stat
          label={`${summary.position ?? 'Pos'} rank`}
          value={summary.positionRank ? `${ordinal(summary.positionRank.rank)}` : '—'}
          hint={summary.positionRank ? `of ${summary.positionRank.of} ${summary.position}s started in ${summary.season}` : undefined}
        />
        <Stat
          label="Acquired"
          value={
            summary.draftPick
              ? `Rd ${summary.draftPick.round}`
              : summary.waiverAdds.length > 0
                ? `Waiver $${summary.waiverAdds[0].cost}`
                : '—'
          }
          hint={
            summary.draftPick
              ? `drafted by ${summary.draftPick.team}`
              : summary.waiverAdds.length > 0
                ? `week ${summary.waiverAdds[0].week} by ${summary.waiverAdds[0].team}`
                : 'undrafted'
          }
        />
      </section>

      {summary.games.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Weekly scores — {summary.season}</h2>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <ScoresChart
              data={chartData}
              teams={[summary.name]}
              seriesColors={{ [summary.name]: color }}
              height={240}
            />
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {summary.games.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">Game log</h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Wk</th>
                    <th className="px-3 py-2 font-medium">Started by</th>
                    <th className="px-3 py-2 font-medium">Slot</th>
                    <th className="px-3 py-2 text-right font-medium">Pts</th>
                    <th className="px-3 py-2 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.games.map((g) => (
                    <tr key={`${g.week}-${g.team}`} className="border-b border-border/40 last:border-0">
                      <td className="tabular px-3 py-2 text-muted-foreground">{g.week}</td>
                      <td className="px-3 py-2">
                        <TeamMark team={g.team} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{g.slot}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{g.score}</td>
                      <td className={`tabular px-3 py-2 text-right text-xs ${g.result === 'Win' ? 'text-win' : 'text-loss'}`}>
                        {g.result === 'Win' ? 'W' : 'L'} vs {g.opponent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="space-y-6">
          {(summary.draftPick || summary.waiverAdds.length > 0) && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Transactions — {summary.season}</h2>
              <div className="space-y-2">
                {summary.draftPick && (
                  <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 shadow-sm">
                    <span className="text-sm">
                      Drafted round {summary.draftPick.round} by <TeamMark team={summary.draftPick.team} className="text-sm" />
                    </span>
                    <Link href={`/draft?season=${summary.season}`} className="text-xs font-medium text-primary hover:underline">
                      Draft board →
                    </Link>
                  </div>
                )}
                {summary.waiverAdds.map((m, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 shadow-sm">
                    <span className="text-sm">
                      Week {m.week}: waiver add by <TeamMark team={m.team} className="text-sm" /> for{' '}
                      <span className="tabular font-semibold">${m.cost}</span>
                    </span>
                    <Link href={`/waivers?season=${summary.season}`} className="text-xs font-medium text-primary hover:underline">
                      Wire →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summaries.length > 1 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Career in the league</h2>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Season</th>
                      <th className="px-3 py-2 text-right font-medium">Starts</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((s) => (
                      <tr key={s.season} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2 font-medium">
                          <Link href={`/players/${params.slug}?season=${s.season}`} className="hover:underline">
                            {s.season}
                          </Link>
                        </td>
                        <td className="tabular px-3 py-2 text-right text-muted-foreground">{s.starts}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{s.total.toLocaleString()}</td>
                        <td className="tabular px-3 py-2 text-right text-muted-foreground">{s.avg.toFixed(1)}</td>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}
