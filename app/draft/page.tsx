import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { draftValue, PickValue } from '@/lib/data/draftValue'
import { CURRENT_SEASON, LEAGUE, ownerColor, teamNameOf } from '@/lib/league'
import { playerSlug, POSITION_COLORS, positionColor } from '@/lib/players'
import { AutoRefresh } from '@/components/league/AutoRefresh'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60
export const metadata: Metadata = { title: 'Draft Board' }

export default async function DraftPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()
  const { draft } = season
  const value = draftValue(season)

  // Draft night: keep the board refreshing while picks are coming in. Once
  // week-1 scores exist the draft is definitively over, so a permanently
  // blank cell can't leave the page refreshing all season.
  const liveDraft =
    season.season === CURRENT_SEASON &&
    season.lastCompletedWeek === 0 &&
    draft.length > 0 &&
    draft.length < LEAGUE.draftRounds * season.teams.length

  const rounds = Array.from(new Set(draft.map((p) => p.round))).sort((a, b) => a - b)
  const slots = Array.from(new Set(draft.map((p) => p.slot))).sort((a, b) => a - b)
  const teamOf = new Map<number, string>()
  for (const p of draft) teamOf.set(p.slot, p.team)
  const pick = (round: number, slot: number) => draft.find((p) => p.round === round && p.slot === slot)

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      {liveDraft && <AutoRefresh seconds={20} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Draft Board
            {liveDraft && (
              <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-sm font-semibold text-win">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--win))]" /> live
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {season.season} · {draft.length} picks · click any player for their season
          </p>
        </div>
        <div className="flex gap-1.5 text-sm">
          {availableSeasons().map((s) => (
            <Link
              key={s}
              href={`/draft?season=${s}`}
              className={`rounded-md px-2.5 py-1 font-medium ${
                s === season.season ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {draft.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No draft board for {season.season} yet — it appears here once the Final Draft Board tab is filled in after
          draft night.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(POSITION_COLORS).map(([pos, color]) => (
              <span key={pos} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {pos}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r bg-card px-2 py-2 text-left font-medium text-muted-foreground">
                    Rd
                  </th>
                  {slots.map((slot) => {
                    const team = teamOf.get(slot) ?? ''
                    return (
                      <th key={slot} className="min-w-[108px] border-b px-1.5 py-2 text-left">
                        <Link href={`/teams/${team.toLowerCase()}`} className="block hover:underline">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ownerColor(team) }} />
                            {team}
                          </span>
                          <span className="block truncate text-[11px] font-normal text-muted-foreground">
                            {teamNameOf(team, season.teamNames)}
                          </span>
                        </Link>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rounds.map((round) => (
                  <tr key={round}>
                    <td className="sticky left-0 z-10 border-r bg-card px-2 py-1 font-semibold text-muted-foreground">
                      {round}
                    </td>
                    {slots.map((slot) => {
                      const p = pick(round, slot)
                      if (!p)
                        return <td key={slot} className="border-b border-l border-border/40 px-1.5 py-1" />
                      return (
                        <td key={slot} className="border-b border-l border-border/40 p-0.5 align-top">
                          <Link
                            href={`/players/${playerSlug(p.player)}?season=${season.season}`}
                            title={`Pick ${p.overall} overall`}
                            className="block rounded-[5px] px-1.5 py-1 leading-tight text-white transition-opacity hover:opacity-85"
                            style={{ backgroundColor: positionColor(p.position) }}
                          >
                            <span className="block truncate font-semibold">{p.player}</span>
                            <span className="text-[10px] opacity-85">
                              {p.position}
                              {p.nflTeam ? ` · ${p.nflTeam}` : ''}
                              {value ? ` · ${value.totals.get(playerSlug(p.player)) ?? 0}p` : ''}
                            </span>
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {value && (
            <div className="grid gap-6 md:grid-cols-2">
              <ValueList
                title="Steals of the draft"
                subtitle="Outscored their draft slot the most"
                entries={value.steals}
                season={season.season}
                good
              />
              <ValueList
                title="Busts of the draft"
                subtitle="Early picks that never paid off (rounds 1–5)"
                entries={value.busts}
                season={season.season}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ValueList({
  title,
  subtitle,
  entries,
  season,
  good = false,
}: {
  title: string
  subtitle: string
  entries: PickValue[]
  season: number
  good?: boolean
}) {
  if (entries.length === 0) return null
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <ol className="space-y-2">
        {entries.map((v) => (
          <li key={`${v.pick.round}-${v.pick.slot}`} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
              style={{ backgroundColor: positionColor(v.pick.position) }}
            >
              {v.pick.position ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/players/${playerSlug(v.pick.player)}?season=${season}`}
                className="block truncate font-semibold hover:underline"
              >
                {v.pick.player}
              </Link>
              <p className="text-xs text-muted-foreground">
                Rd {v.pick.round}, pick {v.pick.overall} · <TeamMark team={v.pick.team} className="text-xs" /> ·{' '}
                {v.starts} start{v.starts === 1 ? '' : 's'}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular font-bold">{v.total} pts</p>
              <p className={`tabular text-xs font-semibold ${good ? 'text-win' : 'text-loss'}`}>
                {v.delta > 0 ? `+${v.delta}` : v.delta} vs slot
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
