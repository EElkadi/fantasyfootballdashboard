import { SeasonData } from '@/lib/types'
import { LEAGUE } from '@/lib/league'

export type ClinchStatus = 'clinched' | 'eliminated' | 'alive'

/**
 * Mathematically safe playoff clinch/elimination flags.
 *
 * Only fully-entered weeks count (the commissioner saves matchups one at a
 * time, so a half-entered week proves nothing), and everything else — the
 * partially-entered week included — is treated as still to play, worth up to
 * 2 wins (H2H + top-6). Score ties at the top-6 cutoff are resolved against
 * the team when computing its own floor and for it when computing rivals'
 * ceilings. The bounds ignore tiebreakers and treat rivals independently,
 * so a badge may appear a week later than a sharper analysis would allow,
 * but never incorrectly.
 */
export function playoffClinchStatus(data: SeasonData): Map<string, ClinchStatus> {
  const result = new Map<string, ClinchStatus>()
  const teams = data.standings.map((s) => s.team)
  const n = teams.length
  if (n === 0) return result
  const spots = LEAGUE.playoffTeams

  const regularRows = data.teamWeeks.filter((r) => r.week <= LEAGUE.regularSeasonWeeks)
  const byWeek = new Map<number, typeof regularRows>()
  for (const row of regularRows) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, [])
    byWeek.get(row.week)!.push(row)
  }

  // A team's floor counts only complete weeks; its ceiling adds 2 wins for
  // every other regular-season week.
  const floorWins = new Map<string, number>(teams.map((t) => [t, 0]))
  const ceilWins = new Map<string, number>(teams.map((t) => [t, 0]))
  let completeWeeks = 0

  byWeek.forEach((rows) => {
    if (rows.length !== n) return // partially entered — treat as still to play
    completeWeeks++
    for (const row of rows) {
      if (row.result === 'Win') {
        floorWins.set(row.team, floorWins.get(row.team)! + 1)
        ceilWins.set(row.team, ceilWins.get(row.team)! + 1)
      }
      const strictlyAbove = rows.filter((o) => o.score > row.score).length
      const tiedOrAbove = rows.filter((o) => o.score >= row.score).length
      // Pessimistic top-6: every cutoff tie ranks ahead of us
      if (tiedOrAbove <= 6) floorWins.set(row.team, floorWins.get(row.team)! + 1)
      // Optimistic top-6: we win any cutoff tie
      if (strictlyAbove < 6) ceilWins.set(row.team, ceilWins.get(row.team)! + 1)
    }
  })

  const remaining = LEAGUE.regularSeasonWeeks - completeWeeks
  for (const team of teams) {
    const floor = floorWins.get(team)!
    const ceiling = ceilWins.get(team)! + 2 * remaining
    const others = teams.filter((t) => t !== team)
    const canCatchFloor = others.filter((t) => ceilWins.get(t)! + 2 * remaining >= floor).length
    const aboveCeiling = others.filter((t) => floorWins.get(t)! > ceiling).length
    if (canCatchFloor < spots) result.set(team, 'clinched')
    else if (aboveCeiling >= spots) result.set(team, 'eliminated')
    else result.set(team, 'alive')
  }
  return result
}
