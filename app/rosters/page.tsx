import Link from 'next/link'
import { Metadata } from 'next'
import { getRosters, getSeason } from '@/lib/data'
import { buildRosterView, describeAcquisition } from '@/lib/data/rosterView'
import { CURRENT_SEASON, LEAGUE, ownerColor, teamNameOf } from '@/lib/league'
import { positionColor } from '@/lib/players'
import { AutoRefresh } from '@/components/league/AutoRefresh'

export const revalidate = 60
export const metadata: Metadata = { title: 'Rosters' }

export default async function RostersPage() {
  const [season, rosters] = await Promise.all([getSeason(CURRENT_SEASON), getRosters()])
  const view = buildRosterView(rosters, season)
  const total = view.reduce((s, t) => s + t.players.length, 0)
  // Draft night: rosters fill in pick by pick
  const liveDraft =
    season.lastCompletedWeek === 0 &&
    season.draft.length > 0 &&
    season.draft.length < LEAGUE.draftRounds * Math.max(1, season.teams.length)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {liveDraft && <AutoRefresh seconds={30} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Rosters · {season.season}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every team&apos;s current roster, straight from the league sheet. Draft picks, waiver adds and trades all
            land here as they happen.
          </p>
        </div>
        <Link href="/waivers" className="text-sm font-medium text-primary hover:underline">
          Transaction log →
        </Link>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Rosters appear once the draft starts — the draft-night tool fills the Rosters tab automatically.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {view.map((t) => (
            <section key={t.team} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <header className="flex items-center gap-3 border-b px-4 py-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-extrabold text-white"
                  style={{ backgroundColor: ownerColor(t.team) }}
                >
                  {t.team[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/teams/${t.team.toLowerCase()}`} className="block truncate font-bold hover:underline">
                    {teamNameOf(t.team, season.teamNames)}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.team} · {t.players.length} players ·{' '}
                    {['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
                      .filter((p) => t.byPosition[p])
                      .map((p) => `${t.byPosition[p]} ${p}`)
                      .join(' · ')}
                  </p>
                </div>
              </header>
              <ul className="divide-y divide-border/40 text-sm">
                {t.players.map((p) => (
                  <li key={p.slug + p.raw} className="flex items-center gap-2.5 px-4 py-1.5">
                    <span
                      className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: positionColor(p.position) }}
                    >
                      {p.position ?? '—'}
                    </span>
                    <Link
                      href={`/players/${p.slug}?season=${season.season}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {p.player}
                    </Link>
                    {p.nflTeam && <span className="shrink-0 text-xs text-muted-foreground">{p.nflTeam}</span>}
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground" title="How they were acquired">
                      {describeAcquisition(p.acquired)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
