import { SeasonData } from '@/lib/types'

/**
 * Weekly awards, derived from the box scores alone. WhatsApp gives us
 * starting lineups only, so nothing here depends on bench data.
 */

export type AwardKey = 'topGun' | 'cupcake' | 'badBeat' | 'heist' | 'nailbiter' | 'hammer'

export interface Award {
  key: AwardKey
  week: number
  team: string
  /** Short factual line, e.g. "141 pts vs Greg" */
  detail: string
}

export const AWARD_META: Record<AwardKey, { emoji: string; name: string; blurb: string }> = {
  topGun: { emoji: '🔫', name: 'Top Gun', blurb: 'Highest score of the week' },
  cupcake: { emoji: '🧁', name: 'Cupcake', blurb: 'Lowest score of the week' },
  badBeat: { emoji: '💔', name: 'Bad Beat', blurb: 'Lost with a top-half score' },
  heist: { emoji: '🥷', name: 'Heist', blurb: 'Won with a bottom-half score' },
  nailbiter: { emoji: '😬', name: 'Nailbiter', blurb: 'Closest game of the week' },
  hammer: { emoji: '🔨', name: 'Hammer', blurb: 'Biggest margin of the week' },
}

export const AWARD_KEYS = Object.keys(AWARD_META) as AwardKey[]

/** Awards for one week. Empty for weeks with no scores. */
export function weeklyAwards(season: SeasonData, week: number): Award[] {
  const rows = season.teamWeeks.filter((r) => r.week === week)
  const matchups = season.matchups.filter((m) => m.week === week)
  if (rows.length === 0 || matchups.length === 0) return []

  const awards: Award[] = []
  const byScore = [...rows].sort((a, b) => b.score - a.score)
  // A zero is a forfeit, not a performance — it never earns (or is spared) an award
  const played = byScore.filter((r) => r.score > 0)
  const half = Math.ceil(byScore.length / 2)
  const topHalf = new Set(byScore.slice(0, half).map((r) => r.team))

  const top = played[0]
  if (top) awards.push({ key: 'topGun', week, team: top.team, detail: `${top.score} pts vs ${top.opponent}` })

  const bottom = played[played.length - 1]
  if (bottom && played.length > 1) {
    awards.push({ key: 'cupcake', week, team: bottom.team, detail: `${bottom.score} pts vs ${bottom.opponent}` })
  }

  // Best score among losers, only if it would have been a top-half week
  const badBeat = played.find((r) => r.result === 'Loss')
  if (badBeat && topHalf.has(badBeat.team)) {
    const opp = rows.find((r) => r.team === badBeat.opponent)
    awards.push({
      key: 'badBeat',
      week,
      team: badBeat.team,
      detail: `${badBeat.score} pts, lost to ${badBeat.opponent}${opp ? ` (${opp.score})` : ''}`,
    })
  }

  // Worst score among winners, only if it was a bottom-half week
  const heist = [...played].reverse().find((r) => r.result === 'Win')
  if (heist && !topHalf.has(heist.team)) {
    const opp = rows.find((r) => r.team === heist.opponent)
    awards.push({
      key: 'heist',
      week,
      team: heist.team,
      detail: `${heist.score} pts, beat ${heist.opponent}${opp ? ` (${opp.score})` : ''}`,
    })
  }

  const margins = matchups.map((m) => ({ m, margin: Math.abs(m.team1.total - m.team2.total) }))
  const closest = margins.reduce((a, b) => (b.margin < a.margin ? b : a))
  awards.push({
    key: 'nailbiter',
    week,
    team: closest.m.winner,
    detail: closest.margin === 0 ? `tiebreaker over ${closest.m.loser}` : `by ${closest.margin} over ${closest.m.loser}`,
  })
  const widest = margins.reduce((a, b) => (b.margin > a.margin ? b : a))
  if (widest.margin > 0 && matchups.length > 1) {
    awards.push({ key: 'hammer', week, team: widest.m.winner, detail: `by ${widest.margin} over ${widest.m.loser}` })
  }

  return awards
}

/** Every award of the season, in week order. */
export function seasonAwards(season: SeasonData): Award[] {
  return season.weeks.flatMap((week) => weeklyAwards(season, week))
}

export interface AwardTally {
  team: string
  counts: Record<AwardKey, number>
  total: number
}

/** Per-team award counts, most decorated first. */
export function tallyAwards(awards: Award[], teams: string[]): AwardTally[] {
  const empty = (): Record<AwardKey, number> =>
    Object.fromEntries(AWARD_KEYS.map((k) => [k, 0])) as Record<AwardKey, number>
  const tallies = new Map<string, AwardTally>(teams.map((team) => [team, { team, counts: empty(), total: 0 }]))
  for (const a of awards) {
    const t = tallies.get(a.team) ?? { team: a.team, counts: empty(), total: 0 }
    tallies.set(a.team, t)
    t.counts[a.key]++
    t.total++
  }
  return Array.from(tallies.values()).sort((a, b) => b.total - a.total || a.team.localeCompare(b.team))
}
