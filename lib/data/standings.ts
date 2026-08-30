import { Matchup, TeamStanding, TeamWeek } from '@/lib/types'

/**
 * Compute standings from scratch out of weekly results.
 *
 * Each week every team plays two "games": the head-to-head matchup, and the
 * top-6 game (finish in the top 6 scores of the week = a win). Overall record
 * is the sum. Ranking: overall wins desc, then head-to-head among tied teams,
 * then points scored (per constitution §IX).
 */
export function computeStandings(teamWeeks: TeamWeek[], matchups: Matchup[]): TeamStanding[] {
  const teams = Array.from(new Set(teamWeeks.map((r) => r.team)))
  if (teams.length === 0) return []

  const weeks = Array.from(new Set(teamWeeks.map((r) => r.week))).sort((a, b) => a - b)

  // Top-6 results per week
  const top6Wins = new Map<string, number>()
  const top6Losses = new Map<string, number>()
  const weeklyRankSum = new Map<string, number>()
  const weeklyRankCount = new Map<string, number>()
  for (const week of weeks) {
    const rows = teamWeeks.filter((r) => r.week === week)
    const sorted = [...rows].sort((a, b) => b.score - a.score)
    const cutoff = Math.min(6, Math.ceil(sorted.length / 2))
    sorted.forEach((row, i) => {
      row.top6 = i < cutoff
      if (i < cutoff) top6Wins.set(row.team, (top6Wins.get(row.team) ?? 0) + 1)
      else top6Losses.set(row.team, (top6Losses.get(row.team) ?? 0) + 1)
      weeklyRankSum.set(row.team, (weeklyRankSum.get(row.team) ?? 0) + i + 1)
      weeklyRankCount.set(row.team, (weeklyRankCount.get(row.team) ?? 0) + 1)
    })
  }

  const standings: TeamStanding[] = teams.map((team) => {
    const rows = teamWeeks.filter((r) => r.team === team).sort((a, b) => a.week - b.week)
    const h2hW = rows.filter((r) => r.result === 'Win').length
    const h2hL = rows.length - h2hW
    const t6W = top6Wins.get(team) ?? 0
    const t6L = top6Losses.get(team) ?? 0
    const pf = rows.reduce((s, r) => s + r.score, 0)
    const pa = rows.reduce((s, r) => {
      const opp = teamWeeks.find((o) => o.week === r.week && o.team === r.opponent)
      return s + (opp?.score ?? 0)
    }, 0)
    const gp = rows.length

    // Streak from H2H results
    let streak = '—'
    if (rows.length > 0) {
      const last = rows[rows.length - 1].result
      let n = 0
      for (let i = rows.length - 1; i >= 0 && rows[i].result === last; i--) n++
      streak = `${last === 'Win' ? 'W' : 'L'}${n}`
    }

    return {
      team,
      rank: 0,
      h2h: { wins: h2hW, losses: h2hL },
      top6: { wins: t6W, losses: t6L },
      overall: { wins: h2hW + t6W, losses: h2hL + t6L },
      pointsFor: pf,
      pointsAgainst: pa,
      avgPointsFor: gp ? pf / gp : 0,
      avgPointsAgainst: gp ? pa / gp : 0,
      diff: pf - pa,
      streak,
      luck: h2hW - t6W,
      power: 0,
      avgWeeklyRank: (weeklyRankSum.get(team) ?? 0) / Math.max(1, weeklyRankCount.get(team) ?? 1),
      gamesPlayed: gp,
    }
  })

  // Head-to-head win counts for tiebreaks
  const h2hIndex = new Map<string, number>()
  for (const m of matchups) {
    const key = `${m.winner}|${m.loser}`
    h2hIndex.set(key, (h2hIndex.get(key) ?? 0) + 1)
  }

  // Rank: overall wins, then — for an exact two-team tie — head-to-head
  // (constitution §IX), then point differential (long-standing sheet
  // practice for multi-team ties), then points for.
  const byRecordThenDiff = (a: TeamStanding, b: TeamStanding) => {
    if (a.overall.wins !== b.overall.wins) return b.overall.wins - a.overall.wins
    if (a.overall.losses !== b.overall.losses) return a.overall.losses - b.overall.losses
    if (a.diff !== b.diff) return b.diff - a.diff
    return b.pointsFor - a.pointsFor
  }
  standings.sort(byRecordThenDiff)
  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i]
    const b = standings[i + 1]
    const tiedGroup =
      a.overall.wins === b.overall.wins &&
      a.overall.losses === b.overall.losses &&
      (i + 2 >= standings.length ||
        standings[i + 2].overall.wins !== a.overall.wins ||
        standings[i + 2].overall.losses !== a.overall.losses) &&
      (i === 0 ||
        standings[i - 1].overall.wins !== a.overall.wins ||
        standings[i - 1].overall.losses !== a.overall.losses)
    if (tiedGroup) {
      const aBeatB = h2hIndex.get(`${a.team}|${b.team}`) ?? 0
      const bBeatA = h2hIndex.get(`${b.team}|${a.team}`) ?? 0
      if (bBeatA > aBeatB) {
        standings[i] = b
        standings[i + 1] = a
      }
    }
  }

  // Power score: scoring strength (50%), recent form over last 3 weeks (30%),
  // overall win% (20%) — normalized to the league and scaled 0–100.
  const lastThree = (team: string) => {
    const rows = teamWeeks
      .filter((r) => r.team === team)
      .sort((a, b) => b.week - a.week)
      .slice(0, 3)
    return rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0
  }
  const norm = (vals: number[]) => {
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    return (v: number) => (max > min ? (v - min) / (max - min) : 0.5)
  }
  const avgN = norm(standings.map((s) => s.avgPointsFor))
  const formVals = standings.map((s) => lastThree(s.team))
  const formN = norm(formVals)
  const winN = norm(standings.map((s) => (s.gamesPlayed ? s.overall.wins / (s.overall.wins + s.overall.losses) : 0)))
  standings.forEach((s, i) => {
    s.rank = i + 1
    const winPct = s.overall.wins + s.overall.losses > 0 ? s.overall.wins / (s.overall.wins + s.overall.losses) : 0
    s.power = Math.round(100 * (0.5 * avgN(s.avgPointsFor) + 0.3 * formN(formVals[i]) + 0.2 * winN(winPct)))
  })

  return standings
}
