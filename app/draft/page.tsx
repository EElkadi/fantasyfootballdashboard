import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { ownerColor, teamNameOf } from '@/lib/league'
import { playerSlug, POSITION_COLORS, positionColor } from '@/lib/players'

export const revalidate = 60
export const metadata: Metadata = { title: 'Draft Board' }

export default async function DraftPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()
  const { draft } = season

  const rounds = Array.from(new Set(draft.map((p) => p.round))).sort((a, b) => a - b)
  const slots = Array.from(new Set(draft.map((p) => p.slot))).sort((a, b) => a - b)
  const teamOf = new Map<number, string>()
  for (const p of draft) teamOf.set(p.slot, p.team)
  const pick = (round: number, slot: number) => draft.find((p) => p.round === round && p.slot === slot)

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Draft Board</h1>
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
                            {teamNameOf(team)}
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
                            className="block rounded-[5px] px-1.5 py-1 leading-tight text-white transition-opacity hover:opacity-85"
                            style={{ backgroundColor: positionColor(p.position) }}
                          >
                            <span className="block truncate font-semibold">{p.player}</span>
                            <span className="text-[10px] opacity-85">
                              {p.position}
                              {p.nflTeam ? ` · ${p.nflTeam}` : ''}
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
        </>
      )}
    </div>
  )
}
