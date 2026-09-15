import { SeasonData, TeamStanding } from '@/lib/types'
import { LEAGUE } from '@/lib/league'
import { h2hIndexOf, rankTeams } from './standings'

export interface TeamOdds {
  team: string
  playoffPct: number
  byePct: number
  topSeedPct: number
  turdPct: number
  avgSeed: number
  avgWins: number
}

export interface SimulationResult {
  sims: number
  weeksSimulated: number[]
  odds: TeamOdds[]
}

/** Deterministic PRNG so the page doesn't flicker between renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Monte Carlo the rest of the regular season. Each team's weekly score is
 * modeled as a normal draw from its own mean/stddev (shrunk toward the league
 * mean early in the year). Seeding uses the real rule — overall record, then
 * head-to-head among tied teams, then points scored — so simulated seeds are
 * broken the same way the standings page breaks them.
 */
export function simulateSeason(data: SeasonData, sims = 3000): SimulationResult | null {
  const { standings, teamWeeks, schedule, lastCompletedWeek } = data
  if (standings.length === 0 || lastCompletedWeek < 2) return null

  const remainingWeeks = schedule
    .filter((w) => w.week > lastCompletedWeek && w.week <= LEAGUE.regularSeasonWeeks)
    .filter((w) => Object.keys(w.opponents).length > 0)
  if (remainingWeeks.length === 0) return null

  const teams = standings.map((s) => s.team)
  const leagueScores = teamWeeks.map((r) => r.score)
  const leagueMean = leagueScores.reduce((a, b) => a + b, 0) / leagueScores.length
  const leagueStd = Math.sqrt(leagueScores.reduce((a, b) => a + (b - leagueMean) ** 2, 0) / leagueScores.length)

  const model = new Map<string, { mean: number; std: number }>()
  for (const team of teams) {
    const scores = teamWeeks.filter((r) => r.team === team).map((r) => r.score)
    const n = scores.length
    const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, n)
    const std = n > 1 ? Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : leagueStd
    // Shrink toward league averages while sample is small
    const w = n / (n + 4)
    model.set(team, {
      mean: w * mean + (1 - w) * leagueMean,
      std: Math.max(8, w * std + (1 - w) * leagueStd),
    })
  }

  const base = new Map<string, TeamStanding>(standings.map((s) => [s.team, s]))
  const baseH2H = h2hIndexOf(data.matchups.filter((m) => m.week <= LEAGUE.regularSeasonWeeks))
  const rand = mulberry32(20260830 + lastCompletedWeek * 7)

  const tally = new Map<
    string,
    { playoffs: number; bye: number; top: number; turd: number; seedSum: number; winSum: number }
  >(teams.map((t) => [t, { playoffs: 0, bye: 0, top: 0, turd: 0, seedSum: 0, winSum: 0 }]))

  for (let sim = 0; sim < sims; sim++) {
    const wins = new Map(teams.map((t) => [t, base.get(t)!.overall.wins]))
    const pointsFor = new Map(teams.map((t) => [t, base.get(t)!.pointsFor]))
    const h2h = new Map(baseH2H)

    for (const week of remainingWeeks) {
      const weekScores = new Map<string, number>()
      for (const team of teams) {
        const m = model.get(team)!
        const score = Math.max(20, Math.round(m.mean + m.std * gaussian(rand)))
        weekScores.set(team, score)
        pointsFor.set(team, pointsFor.get(team)! + score)
      }
      // H2H
      const done = new Set<string>()
      for (const team of teams) {
        if (done.has(team)) continue
        const opp = week.opponents[team]
        if (!opp || done.has(opp) || !weekScores.has(opp)) continue
        done.add(team)
        done.add(opp)
        const a = weekScores.get(team)!
        const b = weekScores.get(opp)!
        const winner = a === b ? (rand() < 0.5 ? team : opp) : a > b ? team : opp
        const loser = winner === team ? opp : team
        wins.set(winner, wins.get(winner)! + 1)
        const key = `${winner}|${loser}`
        h2h.set(key, (h2h.get(key) ?? 0) + 1)
      }
      // Top 6
      const ranked = [...teams].sort((x, y) => weekScores.get(y)! - weekScores.get(x)!)
      for (let i = 0; i < 6 && i < ranked.length; i++) wins.set(ranked[i], wins.get(ranked[i])! + 1)
    }

    // Every week is worth two games (H2H + top 6), so losses follow from wins.
    const order = rankTeams(
      teams.map((team) => ({
        team,
        wins: wins.get(team)!,
        losses: 2 * (base.get(team)!.gamesPlayed + remainingWeeks.length) - wins.get(team)!,
        pointsFor: pointsFor.get(team)!,
      })),
      h2h,
    )
    order.forEach((team, i) => {
      const t = tally.get(team)!
      const seed = i + 1
      t.seedSum += seed
      t.winSum += wins.get(team)!
      if (seed <= LEAGUE.playoffTeams) t.playoffs++
      if (seed <= LEAGUE.playoffByes) t.bye++
      if (seed === 1) t.top++
      if (seed > teams.length - LEAGUE.turdBowlTeams) t.turd++
    })
  }

  const odds: TeamOdds[] = teams
    .map((team) => {
      const t = tally.get(team)!
      return {
        team,
        playoffPct: (100 * t.playoffs) / sims,
        byePct: (100 * t.bye) / sims,
        topSeedPct: (100 * t.top) / sims,
        turdPct: (100 * t.turd) / sims,
        avgSeed: t.seedSum / sims,
        avgWins: t.winSum / sims,
      }
    })
    .sort((a, b) => b.playoffPct - a.playoffPct || a.avgSeed - b.avgSeed)

  return { sims, weeksSimulated: remainingWeeks.map((w) => w.week), odds }
}
