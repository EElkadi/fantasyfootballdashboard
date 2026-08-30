import Link from 'next/link'
import { Matchup, SLOTS } from '@/lib/types'
import { playerSlug } from '@/lib/players'
import { TeamMark } from './TeamMark'

function PlayerCell({ name, season, strong }: { name?: string; season?: number; strong: boolean }) {
  if (!name) return <>—</>
  return (
    <Link
      href={`/players/${playerSlug(name)}${season ? `?season=${season}` : ''}`}
      className={`hover:underline ${strong ? 'font-medium' : ''}`}
    >
      {name}
    </Link>
  )
}

/**
 * One matchup result with the full box score behind a disclosure —
 * server-rendered, no JS needed.
 */
export function MatchupCard({
  matchup,
  defaultOpen = false,
  season,
}: {
  matchup: Matchup
  defaultOpen?: boolean
  season?: number
}) {
  const { team1, team2, winner } = matchup
  const sides = [team1, team2]
  const tie = team1.total === team2.total

  return (
    <details
      className="group rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="space-y-1.5">
            {sides.map((side) => (
              <div key={side.team} className="flex items-center justify-between gap-3">
                <TeamMark team={side.team} className={side.team === winner ? '' : 'opacity-70'} />
                <span
                  className={`tabular text-lg font-bold ${side.team === winner ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {side.total}
                </span>
              </div>
            ))}
          </div>
          <div className="pl-3 text-right text-xs text-muted-foreground">
            <div className={`font-semibold ${winner ? 'text-win' : ''}`}>{winner} wins</div>
            {tie && <div>on tiebreaker</div>}
            <div className="mt-1 opacity-70 transition-transform group-open:hidden">box score ▾</div>
            <div className="mt-1 hidden opacity-70 group-open:block">hide ▴</div>
          </div>
        </div>
      </summary>
      <div className="border-t px-4 py-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-12 pb-1 font-medium"></th>
              <th className="pb-1 font-medium">{team1.team}</th>
              <th className="w-10 pb-1 text-right font-medium"></th>
              <th className="pb-1 pl-4 font-medium">{team2.team}</th>
              <th className="w-10 pb-1 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => {
              const p1 = team1.players.find((p) => p.slot === slot)
              const p2 = team2.players.find((p) => p.slot === slot)
              // Seasons before 2025 had a single flex — skip slots nobody filled
              if (!p1?.player && !p2?.player) return null
              const hi1 = (p1?.score ?? 0) > (p2?.score ?? 0)
              const hi2 = (p2?.score ?? 0) > (p1?.score ?? 0)
              return (
                <tr key={slot} className="border-t border-border/40">
                  <td className="py-1 pr-2 text-xs font-medium text-muted-foreground">{slot}</td>
                  <td className={`py-1 pr-2 ${hi1 ? '' : 'text-muted-foreground'}`}>
                    <PlayerCell name={p1?.player} season={season} strong={hi1} />
                  </td>
                  <td className={`tabular py-1 text-right ${hi1 ? 'font-semibold' : 'text-muted-foreground'}`}>
                    {p1?.score ?? ''}
                  </td>
                  <td className={`py-1 pl-4 pr-2 ${hi2 ? '' : 'text-muted-foreground'}`}>
                    <PlayerCell name={p2?.player} season={season} strong={hi2} />
                  </td>
                  <td className={`tabular py-1 text-right ${hi2 ? 'font-semibold' : 'text-muted-foreground'}`}>
                    {p2?.score ?? ''}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t font-semibold">
              <td className="py-1.5 pr-2 text-xs text-muted-foreground">Total</td>
              <td className="py-1.5"></td>
              <td className="tabular py-1.5 text-right">{team1.total}</td>
              <td className="py-1.5"></td>
              <td className="tabular py-1.5 text-right">{team2.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  )
}
