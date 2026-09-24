import { SeasonData } from '@/lib/types'
import { LEAGUE } from '@/lib/league'
import { computeStandings, weeklyScoreOrder, WeeklyScoreRow } from '@/lib/data/standings'
import { simulateSeason } from '@/lib/data/simulate'
import { playoffClinchStatus } from '@/lib/data/clinch'
import { Award, weeklyAwards } from '@/lib/data/awards'

/**
 * Everything the weekly recap reports, computed once as the league stood
 * after `week`, so the shareable cards and the chat text can't disagree.
 * Pure — see tests/features.test.ts.
 */

export interface StandingLine {
  team: string
  record: string
  /** "94%", "IN" or "OUT"; absent before odds exist (week 1) */
  odds?: string
}

export interface PowerLine {
  team: string
  rank: number
  /** 0–100 */
  power: number
  /** places gained since last week (negative = fell); null in week 1 */
  move: number | null
  record: string
  /** H2H wins minus top-6 wins, season to date */
  luck: number
  odds?: string
}

export interface LuckLine {
  team: string
  luck: number
  h2h: string
  top6: string
}

export interface RecapMetrics {
  standings: StandingLine[]
  /** regular season only — the top-6 game doesn't exist in the playoffs */
  weeklyScores?: WeeklyScoreRow[]
  awards: Award[]
  /** regular season only */
  power?: PowerLine[]
  /** everyone tied for the best luck index, when it's above zero */
  luckiest?: LuckLine[]
  /** everyone tied for the worst, when it's below zero */
  unluckiest?: LuckLine[]
  /** why the odds column is empty, when it is */
  oddsNote?: string
}

const rec = (r: { wins: number; losses: number }) => `${r.wins}-${r.losses}`

function oddsLabel(pct: number): string {
  if (pct >= 99.5) return '>99%'
  if (pct < 0.5) return '<1%'
  return `${Math.round(pct)}%`
}

export function recapMetrics(season: SeasonData, week: number): RecapMetrics {
  const regular = week <= LEAGUE.regularSeasonWeeks
  // Playoff games never count toward the table
  const cutoff = Math.min(week, LEAGUE.regularSeasonWeeks)
  const asOf = (w: number): SeasonData => {
    const teamWeeks = season.teamWeeks.filter((r) => r.week <= w)
    const matchups = season.matchups.filter((m) => m.week <= w)
    return { ...season, teamWeeks, matchups, standings: computeStandings(teamWeeks, matchups), lastCompletedWeek: w }
  }
  const now = asOf(cutoff)
  const standings = now.standings

  // Playoff line: clinch/elimination is certain, the simulation is a forecast
  const odds = new Map<string, string>()
  let oddsNote: string | undefined
  if (cutoff >= LEAGUE.regularSeasonWeeks) {
    standings.forEach((s) => odds.set(s.team, s.rank <= LEAGUE.playoffTeams ? 'IN' : 'OUT'))
  } else {
    const sim = simulateSeason(now)
    if (sim) {
      const clinch = playoffClinchStatus(now)
      for (const o of sim.odds) {
        const status = clinch.get(o.team)
        odds.set(o.team, status === 'clinched' ? 'IN' : status === 'eliminated' ? 'OUT' : oddsLabel(o.playoffPct))
      }
    } else {
      oddsNote = 'Playoff odds start after week 2'
    }
  }

  const byPower = (list: typeof standings) => [...list].sort((a, b) => b.power - a.power || a.rank - b.rank)
  const lastWeek = cutoff >= 2 ? byPower(asOf(cutoff - 1).standings).map((s) => s.team) : null
  const power: PowerLine[] = byPower(standings).map((s, i) => {
    const before = lastWeek ? lastWeek.indexOf(s.team) : -1
    return {
      team: s.team,
      rank: i + 1,
      power: s.power,
      move: before >= 0 ? before - i : null,
      record: rec(s.overall),
      luck: s.luck,
      odds: odds.get(s.team),
    }
  })

  const luckLine = (s: (typeof standings)[number]): LuckLine => ({ team: s.team, luck: s.luck, h2h: rec(s.h2h), top6: rec(s.top6) })
  const best = Math.max(...standings.map((s) => s.luck))
  const worst = Math.min(...standings.map((s) => s.luck))
  const luckiest = best > 0 ? standings.filter((s) => s.luck === best).map(luckLine) : undefined
  const unluckiest = worst < 0 ? standings.filter((s) => s.luck === worst).map(luckLine) : undefined

  return {
    standings: standings.map((s) => ({ team: s.team, record: rec(s.overall), odds: odds.get(s.team) })),
    weeklyScores: regular ? weeklyScoreOrder(season.teamWeeks, season.matchups, week) : undefined,
    awards: weeklyAwards(season, week),
    power: regular ? power : undefined,
    luckiest: regular ? luckiest : undefined,
    unluckiest: regular ? unluckiest : undefined,
    oddsNote: regular ? oddsNote : undefined,
  }
}
