import { DraftPick, SeasonData } from '@/lib/types'
import { playerSlug } from '@/lib/players'

export interface PickValue {
  pick: DraftPick
  /** Points scored in starting lineups that season */
  total: number
  starts: number
  /** Rank among drafted players by points */
  pointsRank: number
  /** Overall pick number minus points rank: positive = outplayed the slot */
  delta: number
}

export interface DraftValue {
  /** Points scored per pick, keyed by player slug */
  totals: Map<string, number>
  steals: PickValue[]
  busts: PickValue[]
}

/**
 * How each draft pick panned out: season points (starts only — bench weeks
 * were never reported) ranked against draft position. A steal outscores its
 * slot; a bust is an early pick that didn't.
 */
export function draftValue(data: SeasonData, count = 5): DraftValue | null {
  if (data.draft.length === 0 || data.playerWeeks.length === 0) return null

  const totals = new Map<string, number>()
  const starts = new Map<string, number>()
  for (const p of data.playerWeeks) {
    const slug = playerSlug(p.player)
    totals.set(slug, (totals.get(slug) ?? 0) + p.score)
    starts.set(slug, (starts.get(slug) ?? 0) + 1)
  }

  const values: PickValue[] = data.draft.map((pick) => {
    const slug = playerSlug(pick.player)
    return {
      pick,
      total: totals.get(slug) ?? 0,
      starts: starts.get(slug) ?? 0,
      pointsRank: 0,
      delta: 0,
    }
  })

  const byPoints = [...values].sort((a, b) => b.total - a.total || a.pick.overall - b.pick.overall)
  byPoints.forEach((v, i) => {
    v.pointsRank = i + 1
    v.delta = v.pick.overall - v.pointsRank
  })

  const steals = [...values]
    .filter((v) => v.total > 0)
    .sort((a, b) => b.delta - a.delta || b.total - a.total)
    .slice(0, count)

  // Busts: first five rounds only — a round-15 flier scoring nothing is
  // expected, a round-2 pick scoring nothing is a story.
  const earlyRounds = Math.min(5, Math.max(...data.draft.map((p) => p.round)))
  const busts = [...values]
    .filter((v) => v.pick.round <= earlyRounds)
    .sort((a, b) => a.delta - b.delta || a.total - b.total)
    .slice(0, count)

  return { totals, steals, busts }
}
