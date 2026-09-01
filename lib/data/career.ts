import { HONORS, LEAGUE } from '@/lib/league'
import { SeasonData } from '@/lib/types'
import { RecordBook } from './records'

/**
 * One manager's career across every season on file. Only seasons that
 * finished their regular season count toward playoff appearances; the live
 * season still contributes games and points.
 */
export interface CareerSummary {
  seasons: number
  overall: { wins: number; losses: number }
  h2h: { wins: number; losses: number }
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number
  winPct: number
  playoffAppearances: number
  /** Regular-season #1 finishes */
  regularSeasonTitles: number
  bestFinish?: { rank: number; season: number }
  bestWeek?: { score: number; week: number; season: number }
}

export function careerSummary(seasons: SeasonData[], team: string): CareerSummary | null {
  const played = seasons.filter((s) => s.teamWeeks.some((r) => r.team === team))
  if (played.length === 0) return null

  const summary: CareerSummary = {
    seasons: played.length,
    overall: { wins: 0, losses: 0 },
    h2h: { wins: 0, losses: 0 },
    pointsFor: 0,
    pointsAgainst: 0,
    avgPointsFor: 0,
    winPct: 0,
    playoffAppearances: 0,
    regularSeasonTitles: 0,
  }
  let games = 0
  for (const s of played) {
    const standing = s.standings.find((x) => x.team === team)
    if (standing) {
      summary.overall.wins += standing.overall.wins
      summary.overall.losses += standing.overall.losses
      summary.h2h.wins += standing.h2h.wins
      summary.h2h.losses += standing.h2h.losses
      summary.pointsFor += standing.pointsFor
      summary.pointsAgainst += standing.pointsAgainst
      games += standing.gamesPlayed
      const finished = s.lastCompletedWeek >= LEAGUE.regularSeasonWeeks
      if (finished && standing.rank <= LEAGUE.playoffTeams) summary.playoffAppearances++
      if (finished && standing.rank === 1) summary.regularSeasonTitles++
      if (finished && (!summary.bestFinish || standing.rank < summary.bestFinish.rank)) {
        summary.bestFinish = { rank: standing.rank, season: s.season }
      }
    }
    for (const r of s.teamWeeks) {
      if (r.team !== team) continue
      if (!summary.bestWeek || r.score > summary.bestWeek.score) {
        summary.bestWeek = { score: r.score, week: r.week, season: s.season }
      }
    }
  }
  summary.avgPointsFor = games ? summary.pointsFor / games : 0
  const total = summary.overall.wins + summary.overall.losses
  summary.winPct = total ? summary.overall.wins / total : 0
  return summary
}

export interface Trophy {
  emoji: string
  title: string
  detail: string
  season: number
  /** Playoff/season honors first, then record-book holdings */
  tier: 'honor' | 'record'
}

/** Everything worth putting in a display case: league honors plus any record-book entry this team holds. */
export function trophyCase(team: string, book: RecordBook): Trophy[] {
  const trophies: Trophy[] = []
  for (const h of HONORS) {
    if (h.champion === team) trophies.push({ emoji: '🏆', title: 'League Champion', detail: `${h.season} title`, season: h.season, tier: 'honor' })
    if (h.runnerUp === team) trophies.push({ emoji: '🥈', title: 'Runner-up', detail: `Lost the ${h.season} final`, season: h.season, tier: 'honor' })
    if (h.third === team) trophies.push({ emoji: '🥉', title: 'Third place', detail: `${h.season} consolation winner`, season: h.season, tier: 'honor' })
    if (h.scoringChamp === team) trophies.push({ emoji: '🎯', title: 'Scoring Champ', detail: `Most points in ${h.season} · $${LEAGUE.scoringChampPrize}`, season: h.season, tier: 'honor' })
    if (h.turd === team) trophies.push({ emoji: '💩', title: 'The Turd', detail: `Lost the ${h.season} Turd Bowl`, season: h.season, tier: 'honor' })
  }
  // Season bests (scoring champ, best record) are already covered by the
  // honors above and the career summary, so only game and streak records
  // land here.
  // "Highest-scoring game" names both teams as "A & B"
  const entries = [...book.games, ...book.streaks].filter((e) => e.holder.split(' & ').includes(team))
  for (const e of entries) {
    trophies.push({
      emoji: '📜',
      title: e.label,
      detail: `${e.value}${e.season ? ` · ${e.season}${e.week ? ` wk ${e.week}` : ''}` : ''}`,
      season: e.season,
      tier: 'record',
    })
  }
  return trophies.sort((a, b) => (a.tier === b.tier ? b.season - a.season : a.tier === 'honor' ? -1 : 1))
}
