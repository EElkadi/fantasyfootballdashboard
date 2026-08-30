import { Matchup, SeasonData } from '@/lib/types'

export interface RecordEntry {
  label: string
  holder: string
  value: string
  detail: string
  season: number
  week?: number
}

export interface RecordBook {
  games: RecordEntry[]
  players: RecordEntry[]
  seasons: RecordEntry[]
  streaks: RecordEntry[]
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** All-time record book across every season with data. */
export function buildRecordBook(seasons: SeasonData[]): RecordBook {
  const games: RecordEntry[] = []
  const players: RecordEntry[] = []
  const seasonRecords: RecordEntry[] = []
  const streaks: RecordEntry[] = []

  type Tagged<T> = T & { season: number }
  const allMatchups: Tagged<Matchup>[] = seasons.flatMap((s) => s.matchups.map((m) => ({ ...m, season: s.season })))
  const allTeamWeeks = seasons.flatMap((s) => s.teamWeeks.map((r) => ({ ...r, season: s.season })))
  const allPlayerWeeks = seasons.flatMap((s) => s.playerWeeks.map((r) => ({ ...r, season: s.season })))
  if (allMatchups.length === 0) return { games, players, seasons: seasonRecords, streaks }

  // --- Game records ---
  const byScore = [...allTeamWeeks].sort((a, b) => b.score - a.score)
  const high = byScore[0]
  games.push({
    label: 'Highest single-week score',
    holder: high.team,
    value: `${fmt(high.score)} pts`,
    detail: `vs ${high.opponent}`,
    season: high.season,
    week: high.week,
  })
  const nonForfeit = byScore.filter((r) => r.score > 0)
  const low = nonForfeit[nonForfeit.length - 1]
  games.push({
    label: 'Lowest single-week score',
    holder: low.team,
    value: `${fmt(low.score)} pts`,
    detail: `vs ${low.opponent}`,
    season: low.season,
    week: low.week,
  })

  const withMargin = allMatchups.map((m) => ({ m, margin: Math.abs(m.team1.total - m.team2.total) }))
  const blowout = withMargin.reduce((a, b) => (b.margin > a.margin ? b : a))
  games.push({
    label: 'Biggest blowout',
    holder: blowout.m.winner,
    value: `by ${fmt(blowout.margin)}`,
    detail: `${blowout.m.winner} ${fmt(Math.max(blowout.m.team1.total, blowout.m.team2.total))} — ${fmt(
      Math.min(blowout.m.team1.total, blowout.m.team2.total),
    )} ${blowout.m.loser}`,
    season: blowout.m.season,
    week: blowout.m.week,
  })
  const nailbiter = withMargin.reduce((a, b) => (b.margin < a.margin ? b : a))
  games.push({
    label: 'Closest game',
    holder: nailbiter.m.winner,
    value: nailbiter.margin === 0 ? 'tiebreaker' : `by ${fmt(nailbiter.margin)}`,
    detail: `${nailbiter.m.winner} ${fmt(Math.max(nailbiter.m.team1.total, nailbiter.m.team2.total))} — ${fmt(
      Math.min(nailbiter.m.team1.total, nailbiter.m.team2.total),
    )} ${nailbiter.m.loser}`,
    season: nailbiter.m.season,
    week: nailbiter.m.week,
  })
  const shootout = allMatchups.reduce((a, b) =>
    b.team1.total + b.team2.total > a.team1.total + a.team2.total ? b : a,
  )
  games.push({
    label: 'Highest-scoring game',
    holder: `${shootout.team1.team} & ${shootout.team2.team}`,
    value: `${fmt(shootout.team1.total + shootout.team2.total)} combined`,
    detail: `${shootout.team1.team} ${fmt(shootout.team1.total)} — ${fmt(shootout.team2.total)} ${shootout.team2.team}`,
    season: shootout.season,
    week: shootout.week,
  })
  const heartbreak = [...allTeamWeeks].filter((r) => r.result === 'Loss').sort((a, b) => b.score - a.score)[0]
  if (heartbreak) {
    games.push({
      label: 'Best score in a loss',
      holder: heartbreak.team,
      value: `${fmt(heartbreak.score)} pts`,
      detail: `lost to ${heartbreak.opponent}`,
      season: heartbreak.season,
      week: heartbreak.week,
    })
  }
  const steal = [...allTeamWeeks].filter((r) => r.result === 'Win' && r.score > 0).sort((a, b) => a.score - b.score)[0]
  if (steal) {
    games.push({
      label: 'Worst score in a win',
      holder: steal.team,
      value: `${fmt(steal.score)} pts`,
      detail: `beat ${steal.opponent}`,
      season: steal.season,
      week: steal.week,
    })
  }

  // --- Player records ---
  const bestPlayer = [...allPlayerWeeks].sort((a, b) => b.score - a.score)[0]
  if (bestPlayer) {
    players.push({
      label: 'Best single-week player',
      holder: bestPlayer.player,
      value: `${fmt(bestPlayer.score)} pts`,
      detail: `${bestPlayer.slot} for ${bestPlayer.team}`,
      season: bestPlayer.season,
      week: bestPlayer.week,
    })
  }
  for (const group of [
    { label: 'Best QB week', slots: ['QB'] },
    { label: 'Best RB week', slots: ['RB1', 'RB2'] },
    { label: 'Best WR week', slots: ['WR1', 'WR2'] },
    { label: 'Best flex week', slots: ['Flex', 'Flex2'] },
    { label: 'Best DEF week', slots: ['DEF'] },
    { label: 'Best K week', slots: ['K'] },
  ]) {
    const best = allPlayerWeeks
      .filter((p) => group.slots.includes(p.slot))
      .sort((a, b) => b.score - a.score)[0]
    if (best) {
      players.push({
        label: group.label,
        holder: best.player,
        value: `${fmt(best.score)} pts`,
        detail: `for ${best.team}`,
        season: best.season,
        week: best.week,
      })
    }
  }

  // --- Season records ---
  for (const s of seasons) {
    if (s.standings.length === 0) continue
    const mostPf = [...s.standings].sort((a, b) => b.pointsFor - a.pointsFor)[0]
    seasonRecords.push({
      label: `${s.season} scoring champ`,
      holder: mostPf.team,
      value: `${fmt(mostPf.pointsFor)} pts`,
      detail: `${mostPf.avgPointsFor.toFixed(1)} per week`,
      season: s.season,
    })
    const best = s.standings[0]
    seasonRecords.push({
      label: `${s.season} best record`,
      holder: best.team,
      value: `${best.overall.wins}-${best.overall.losses}`,
      detail: `${best.h2h.wins}-${best.h2h.losses} H2H · ${best.top6.wins}-${best.top6.losses} top-6`,
      season: s.season,
    })
  }

  // --- Streaks (H2H, within a season) ---
  let bestWin = { team: '', len: 0, season: 0 }
  let bestLoss = { team: '', len: 0, season: 0 }
  for (const s of seasons) {
    for (const team of s.teams) {
      const results = s.teamWeeks
        .filter((r) => r.team === team)
        .sort((a, b) => a.week - b.week)
        .map((r) => r.result)
      let cur = 0
      let curType: 'Win' | 'Loss' | null = null
      for (const r of results) {
        if (r === curType) cur++
        else {
          curType = r
          cur = 1
        }
        if (curType === 'Win' && cur > bestWin.len) bestWin = { team, len: cur, season: s.season }
        if (curType === 'Loss' && cur > bestLoss.len) bestLoss = { team, len: cur, season: s.season }
      }
    }
  }
  if (bestWin.len > 0) {
    streaks.push({
      label: 'Longest win streak',
      holder: bestWin.team,
      value: `${bestWin.len} straight`,
      detail: 'head-to-head',
      season: bestWin.season,
    })
  }
  if (bestLoss.len > 0) {
    streaks.push({
      label: 'Longest losing streak',
      holder: bestLoss.team,
      value: `${bestLoss.len} straight`,
      detail: 'head-to-head',
      season: bestLoss.season,
    })
  }

  return { games, players, seasons: seasonRecords, streaks }
}

/** Career head-to-head records for one team across seasons. */
export function careerHeadToHead(seasons: SeasonData[], team: string): { opponent: string; wins: number; losses: number }[] {
  const map = new Map<string, { wins: number; losses: number }>()
  for (const s of seasons) {
    for (const r of s.teamWeeks) {
      if (r.team !== team) continue
      if (!map.has(r.opponent)) map.set(r.opponent, { wins: 0, losses: 0 })
      const rec = map.get(r.opponent)!
      if (r.result === 'Win') rec.wins++
      else rec.losses++
    }
  }
  return Array.from(map.entries())
    .map(([opponent, rec]) => ({ opponent, ...rec }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || a.opponent.localeCompare(b.opponent))
}
