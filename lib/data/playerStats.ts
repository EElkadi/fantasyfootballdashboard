import { DraftPick, SeasonData, WaiverMove } from '@/lib/types'
import { playerSlug } from '@/lib/players'

export interface PlayerGame {
  week: number
  team: string
  slot: string
  score: number
  opponent?: string
  result?: 'Win' | 'Loss'
}

export interface PlayerSeasonSummary {
  season: number
  name: string
  position?: string
  nflTeam?: string
  starts: number
  total: number
  avg: number
  best: PlayerGame | null
  worst: PlayerGame | null
  games: PlayerGame[]
  teams: string[]
  draftPick?: DraftPick
  waiverAdds: WaiverMove[]
  positionRank?: { rank: number; of: number }
}

const SLOT_POSITION: Record<string, string> = {
  QB: 'QB',
  RB1: 'RB',
  RB2: 'RB',
  WR1: 'WR',
  WR2: 'WR',
  DEF: 'DEF',
  K: 'K',
}

/** Best-effort base position for a player within one season's data. */
function derivePosition(data: SeasonData, slug: string): { position?: string; nflTeam?: string } {
  const draft = data.draft.find((p) => playerSlug(p.player) === slug)
  if (draft?.position) return { position: draft.position, nflTeam: draft.nflTeam }
  const waiver = data.waivers.find((m) => playerSlug(m.player) === slug)
  if (waiver?.position) return { position: waiver.position, nflTeam: waiver.nflTeam }
  const weeks = data.playerWeeks.filter((p) => playerSlug(p.player) === slug)
  const withPos = weeks.find((p) => p.position)
  if (withPos?.position) return { position: withPos.position.replace('D/ST', 'DEF') }
  const slotCounts = new Map<string, number>()
  for (const w of weeks) {
    const pos = SLOT_POSITION[w.slot]
    if (pos) slotCounts.set(pos, (slotCounts.get(pos) ?? 0) + 1)
  }
  const best = Array.from(slotCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  return { position: best?.[0] }
}

/** Everyone's season totals keyed by slug, with derived positions — for ranks. */
function seasonTotals(data: SeasonData): Map<string, { name: string; total: number; position?: string }> {
  const totals = new Map<string, { name: string; total: number; position?: string }>()
  for (const p of data.playerWeeks) {
    const slug = playerSlug(p.player)
    if (!slug) continue
    if (!totals.has(slug)) totals.set(slug, { name: p.player, total: 0 })
    totals.get(slug)!.total += p.score
  }
  totals.forEach((entry, slug) => {
    entry.position = derivePosition(data, slug).position
  })
  return totals
}

export function playerSeasonSummary(data: SeasonData, slug: string): PlayerSeasonSummary | null {
  const weeks = data.playerWeeks.filter((p) => playerSlug(p.player) === slug)
  const draftPick = data.draft.find((p) => playerSlug(p.player) === slug)
  const waiverAdds = data.waivers.filter((m) => playerSlug(m.player) === slug)
  if (weeks.length === 0 && !draftPick && waiverAdds.length === 0) return null

  const name = weeks[0]?.player ?? draftPick?.player ?? waiverAdds[0]?.player ?? slug
  const games: PlayerGame[] = weeks
    .map((p) => {
      const teamWeek = data.teamWeeks.find((t) => t.week === p.week && t.team === p.team)
      return {
        week: p.week,
        team: p.team,
        slot: p.slot,
        score: p.score,
        opponent: teamWeek?.opponent,
        result: teamWeek?.result,
      }
    })
    .sort((a, b) => a.week - b.week)

  const total = games.reduce((s, g) => s + g.score, 0)
  const { position, nflTeam } = derivePosition(data, slug)

  let positionRank: PlayerSeasonSummary['positionRank']
  if (position && games.length > 0) {
    const peers = Array.from(seasonTotals(data).entries())
      .filter(([, e]) => e.position === position)
      .sort((a, b) => b[1].total - a[1].total)
    const idx = peers.findIndex(([s]) => s === slug)
    if (idx >= 0) positionRank = { rank: idx + 1, of: peers.length }
  }

  return {
    season: data.season,
    name,
    position,
    starts: games.length,
    total,
    avg: games.length ? total / games.length : 0,
    best: games.length ? games.reduce((a, b) => (b.score > a.score ? b : a)) : null,
    worst: games.length ? games.reduce((a, b) => (b.score < a.score ? b : a)) : null,
    games,
    teams: Array.from(new Set(games.map((g) => g.team))),
    draftPick,
    waiverAdds,
    positionRank,
    nflTeam,
  }
}
