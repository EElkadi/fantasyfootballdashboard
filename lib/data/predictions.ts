import { Prediction } from '@/lib/types'

/** How a ballot is holding up against the real table. Lower error is better. */
export interface PredictionScore {
  manager: string
  /** Sum of |predicted rank − actual rank| over teams in the standings */
  error: number
  /** Teams placed in exactly the right spot */
  exact: number
  champion: string
  turd: string
  /** Set once the season's honors are known */
  championHit?: boolean
  turdHit?: boolean
  /** Where they put themselves */
  ownPredicted?: number
  /** Consensus rank of their own team minus where they put themselves (positive = homer) */
  homer?: number
}

export interface ConsensusRank {
  team: string
  avgRank: number
  /** Ballots that had this team first */
  firsts: number
  /** Ballots that had this team last */
  lasts: number
}

export function consensusOrder(predictions: Prediction[], teams: string[]): ConsensusRank[] {
  if (predictions.length === 0) return []
  return teams
    .map((team) => {
      const ranks = predictions.map((p) => p.order.indexOf(team) + 1).filter((r) => r > 0)
      return {
        team,
        avgRank: ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : teams.length,
        firsts: predictions.filter((p) => p.order[0] === team).length,
        lasts: predictions.filter((p) => p.order[p.order.length - 1] === team).length,
      }
    })
    .sort((a, b) => a.avgRank - b.avgRank || b.firsts - a.firsts || a.team.localeCompare(b.team))
}

export function scorePredictions(
  predictions: Prediction[],
  standings: { team: string; rank: number }[],
  honors?: { champion?: string; turd?: string },
): PredictionScore[] {
  const consensus = consensusOrder(
    predictions,
    standings.map((s) => s.team),
  )
  const consensusRank = new Map(consensus.map((c, i) => [c.team, i + 1]))
  return predictions
    .map((p) => {
      let error = 0
      let exact = 0
      for (const s of standings) {
        const predicted = p.order.indexOf(s.team) + 1
        if (predicted === 0) continue
        error += Math.abs(predicted - s.rank)
        if (predicted === s.rank) exact++
      }
      const ownPredicted = p.order.indexOf(p.manager) + 1 || undefined
      const own = consensusRank.get(p.manager)
      return {
        manager: p.manager,
        error,
        exact,
        champion: p.champion,
        turd: p.turd,
        championHit: honors?.champion ? p.champion === honors.champion : undefined,
        turdHit: honors?.turd ? p.turd === honors.turd : undefined,
        ownPredicted,
        homer: ownPredicted && own ? own - ownPredicted : undefined,
      }
    })
    .sort((a, b) => a.error - b.error || b.exact - a.exact || a.manager.localeCompare(b.manager))
}
