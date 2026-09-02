import { TeamStanding } from '@/lib/types'
import { TeamOdds } from '@/lib/data/simulate'
import { LEAGUE } from '@/lib/league'
import { TeamMark } from './TeamMark'

const rec = (r: { wins: number; losses: number }) => `${r.wins}-${r.losses}`

/**
 * The league table. Playoff line after 6, turd-bowl zone shaded for the
 * bottom 4. `odds` adds a playoff-probability column when a simulation ran.
 */
export function StandingsTable({
  standings,
  odds,
  compact = false,
  teamNames,
}: {
  standings: TeamStanding[]
  odds?: TeamOdds[] | null
  compact?: boolean
  teamNames?: Record<string, string>
}) {
  const oddsFor = (team: string) => odds?.find((o) => o.team === team)
  const turdLine = standings.length - LEAGUE.turdBowlTeams

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className={`w-full text-sm ${compact ? 'min-w-[340px]' : 'min-w-[560px]'}`}>
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Team</th>
            <th className="px-3 py-2.5 text-right font-medium">Overall</th>
            <th className="px-3 py-2.5 text-right font-medium">H2H</th>
            <th className="px-3 py-2.5 text-right font-medium">Top 6</th>
            {!compact && (
              <>
                <th className="px-3 py-2.5 text-right font-medium">PF</th>
                <th className="px-3 py-2.5 text-right font-medium">PA</th>
                <th className="px-3 py-2.5 text-right font-medium">Diff</th>
                <th className="px-3 py-2.5 text-right font-medium">Streak</th>
              </>
            )}
            {odds && <th className="px-3 py-2.5 text-right font-medium">Playoff %</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const o = oddsFor(s.team)
            return (
              <tr
                key={s.team}
                className={`border-b border-border/40 last:border-0 ${
                  i === LEAGUE.playoffTeams ? 'border-t-2 border-t-primary/50' : ''
                } ${i >= turdLine ? 'bg-destructive/5' : ''}`}
              >
                <td className="tabular px-3 py-2.5 text-muted-foreground">{s.rank}</td>
                <td className="px-3 py-2.5">
                  <TeamMark team={s.team} showTeamName={!compact} teamNames={teamNames} />
                </td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">{rec(s.overall)}</td>
                <td className="tabular px-3 py-2.5 text-right text-muted-foreground">{rec(s.h2h)}</td>
                <td className="tabular px-3 py-2.5 text-right text-muted-foreground">{rec(s.top6)}</td>
                {!compact && (
                  <>
                    <td className="tabular px-3 py-2.5 text-right">{s.pointsFor.toLocaleString()}</td>
                    <td className="tabular px-3 py-2.5 text-right text-muted-foreground">
                      {s.pointsAgainst.toLocaleString()}
                    </td>
                    <td
                      className={`tabular px-3 py-2.5 text-right ${s.diff > 0 ? 'text-win' : s.diff < 0 ? 'text-loss' : ''}`}
                    >
                      {s.diff > 0 ? '+' : ''}
                      {s.diff.toLocaleString()}
                    </td>
                    <td
                      className={`tabular px-3 py-2.5 text-right ${s.streak.startsWith('W') ? 'text-win' : 'text-loss'}`}
                    >
                      {s.streak}
                    </td>
                  </>
                )}
                {odds && (
                  <td className="tabular px-3 py-2.5 text-right">
                    {o ? (o.playoffPct >= 99.95 ? '>99' : o.playoffPct < 0.05 ? '<1' : o.playoffPct.toFixed(0)) + '%' : '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block h-2 w-4 rounded-sm border-t-2 border-primary/60 align-middle" /> playoff
          line (top {LEAGUE.playoffTeams})
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-4 rounded-sm bg-destructive/10 align-middle" /> Turd Bowl zone
        </span>
        <span>Each week counts twice: your matchup + a top-6 scoring finish.</span>
      </div>
    </div>
  )
}
