import { Matchup, TeamStanding, TeamWeek } from '@/lib/types'

/**
 * Compute standings from scratch out of weekly results.
 *
 * Each week every team plays two "games": the head-to-head matchup, and the
 * top-6 game (finish in the top 6 scores of the week = a win). Overall record
 * is the sum. Ranking: overall record, then head-to-head among the tied
 * teams, then points scored (constitution §IX).
 */

export interface WeeklyScoreRow {
  team: string
  score: number
  /** 1 = highest score of the week */
  rank: number
  /** made the top-6 cut, i.e. banked the extra win */
  top6: boolean
}

/** Head-to-head meeting counts, keyed `winner|loser`. */
export type H2HIndex = Map<string, number>

export function h2hIndexOf(matchups: Matchup[]): H2HIndex {
  const index: H2HIndex = new Map()
  for (const m of matchups) {
    const key = `${m.winner}|${m.loser}`
    index.set(key, (index.get(key) ?? 0) + 1)
  }
  return index
}

/**
 * Exact-score tiebreak for the top-6 cut: highest RB1, then WR1, then QB
 * (constitution §IX).
 */
function slotTiebreaker(matchups: Matchup[]) {
  const slotScore = new Map<string, number>()
  for (const m of matchups) {
    for (const side of [m.team1, m.team2]) {
      for (const p of side.players) slotScore.set(`${m.week}|${side.team}|${p.slot}`, p.score)
    }
  }
  return (week: number, a: string, b: string): number => {
    for (const slot of ['RB1', 'WR1', 'QB']) {
      const sa = slotScore.get(`${week}|${a}|${slot}`) ?? 0
      const sb = slotScore.get(`${week}|${b}|${slot}`) ?? 0
      if (sa !== sb) return sb - sa
    }
    return 0
  }
}

/**
 * The week's scoring order, highest first, flagged with who made the top-6
 * cut. Half the league wins that game, so a short week (fewer teams reporting)
 * cuts proportionally rather than handing out six wins regardless.
 */
export function weeklyScoreOrder(teamWeeks: TeamWeek[], matchups: Matchup[], week: number): WeeklyScoreRow[] {
  const tiebreak = slotTiebreaker(matchups)
  return weeklyOrder(teamWeeks.filter((r) => r.week === week), week, tiebreak)
}

function weeklyOrder(
  rows: TeamWeek[],
  week: number,
  tiebreak: (week: number, a: string, b: string) => number,
): WeeklyScoreRow[] {
  const cutoff = Math.min(6, Math.ceil(rows.length / 2))
  return [...rows]
    .sort((a, b) => b.score - a.score || tiebreak(week, a.team, b.team))
    .map((row, i) => ({ team: row.team, score: row.score, rank: i + 1, top6: i < cutoff }))
}

/**
 * Order teams that are level on overall record: head-to-head first, then
 * points scored.
 *
 * Head-to-head is a mini-league among exactly the teams still tied — each
 * team's wins minus losses in meetings with the others. The best takes the
 * next spot, then the group re-resolves among whoever is left, so a three-way
 * tie collapses to the plain two-team rule once one team is placed. Teams that
 * never met each other net out to zero and fall through to points scored.
 *
 * Returns team names in rank order.
 */
export function rankTeams(
  rows: { team: string; wins: number; losses: number; pointsFor: number }[],
  h2h: H2HIndex,
): string[] {
  const byRecord = [...rows].sort((a, b) => b.wins - a.wins || a.losses - b.losses)
  const ranked: string[] = []

  for (let i = 0; i < byRecord.length; ) {
    // Everyone level with byRecord[i] forms one tied group.
    let end = i + 1
    while (end < byRecord.length && byRecord[end].wins === byRecord[i].wins && byRecord[end].losses === byRecord[i].losses) {
      end++
    }
    const group = byRecord.slice(i, end)

    while (group.length > 0) {
      let best = 0
      for (let j = 1; j < group.length; j++) {
        const net = (t: (typeof group)[number]) =>
          group.reduce((s, o) => (o === t ? s : s + (h2h.get(`${t.team}|${o.team}`) ?? 0) - (h2h.get(`${o.team}|${t.team}`) ?? 0)), 0)
        const a = group[j]
        const b = group[best]
        const cmp = net(a) - net(b) || a.pointsFor - b.pointsFor || b.team.localeCompare(a.team)
        if (cmp > 0) best = j
      }
      ranked.push(group[best].team)
      group.splice(best, 1)
    }
    i = end
  }
  return ranked
}

export function computeStandings(teamWeeks: TeamWeek[], matchups: Matchup[]): TeamStanding[] {
  const teams = Array.from(new Set(teamWeeks.map((r) => r.team)))
  if (teams.length === 0) return []

  const weeks = Array.from(new Set(teamWeeks.map((r) => r.week))).sort((a, b) => a - b)
  const tiebreak = slotTiebreaker(matchups)

  // Top-6 results per week
  const top6Wins = new Map<string, number>()
  const top6Losses = new Map<string, number>()
  const weeklyRankSum = new Map<string, number>()
  const weeklyRankCount = new Map<string, number>()
  for (const week of weeks) {
    for (const row of weeklyOrder(teamWeeks.filter((r) => r.week === week), week, tiebreak)) {
      const bucket = row.top6 ? top6Wins : top6Losses
      bucket.set(row.team, (bucket.get(row.team) ?? 0) + 1)
      weeklyRankSum.set(row.team, (weeklyRankSum.get(row.team) ?? 0) + row.rank)
      weeklyRankCount.set(row.team, (weeklyRankCount.get(row.team) ?? 0) + 1)
    }
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

  const order = rankTeams(
    standings.map((s) => ({ team: s.team, wins: s.overall.wins, losses: s.overall.losses, pointsFor: s.pointsFor })),
    h2hIndexOf(matchups),
  )
  standings.sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team))

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
