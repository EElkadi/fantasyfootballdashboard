export const SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'DEF', 'K', 'Flex', 'Flex2'] as const
export type Slot = (typeof SLOTS)[number]

export interface PlayerScore {
  slot: Slot
  /** Display name, e.g. "Josh Allen" (NFL team / position suffix stripped) */
  player: string
  /** Raw cell value from the sheet, e.g. "Josh Allen BUF (QB)" */
  raw?: string
  nflTeam?: string
  position?: string
  score: number
}

export interface TeamLineup {
  team: string
  players: PlayerScore[]
  /** Official total (includes any penalty/adjustment) */
  total: number
  /** Official total minus the players' sum, when they differ */
  adjustment?: number
  /** Why — e.g. "Late confirmation penalty (§VII)" */
  adjustmentNote?: string
}

export interface Matchup {
  week: number
  team1: TeamLineup
  team2: TeamLineup
  winner: string
  loser: string
}

export interface TeamWeek {
  week: number
  team: string
  score: number
  opponent: string
  result: 'Win' | 'Loss'
  /** Finished in the top 6 scores of the week */
  top6?: boolean
}

export interface PlayerWeek {
  week: number
  team: string
  player: string
  slot: Slot
  score: number
  position?: string
}

export interface Record_ {
  wins: number
  losses: number
}

export interface TeamStanding {
  team: string
  rank: number
  h2h: Record_
  top6: Record_
  overall: Record_
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number
  avgPointsAgainst: number
  diff: number
  /** e.g. "W3" / "L2", from head-to-head results */
  streak: string
  /** H2H wins minus top-6 wins. Positive = schedule has been kind. */
  luck: number
  /** 0-100 composite of scoring strength, recent form and record */
  power: number
  /** Position in the weekly scoring ranks, averaged */
  avgWeeklyRank: number
  gamesPlayed: number
}

export interface DraftPick {
  round: number
  /** Draft-order column, 1–12 */
  slot: number
  /** Overall pick number (snake order) */
  overall: number
  team: string
  player: string
  nflTeam?: string
  position?: string
}

/** Live draft state served by /api/commish/draft */
export interface DraftState {
  order: { slot: number; team: string }[]
  picks: DraftPick[]
  next: { round: number; slot: number; overall: number; team: string } | null
  rounds: number
}

export interface Trade {
  team1: string
  team2: string
  /** Asset descriptions, e.g. "Zack Moss (RB, CIN)" or "Round 1, Pick 4" */
  team1Gets: string[]
  team2Gets: string[]
}

export interface WaiverMove {
  week: number
  team: string
  player: string
  nflTeam?: string
  position?: string
  cost: number
}

/** One row of the Player Pool tab — the draftable universe, in the sheet's (ranked) order */
export interface PoolPlayer {
  player: string
  nflTeam?: string
  position?: string
  /** 1-based row order on the tab; the pool is kept in rough draft-value order */
  rank: number
}

/** One starting-lineup slot as submitted before the deadline (latest submission wins) */
export interface LineupEntry {
  week: number
  team: string
  slot: Slot
  player: string
  /** ISO timestamp of the submission that set this slot */
  submittedAt: string
}

/** One manager's preseason ballot */
export interface Prediction {
  manager: string
  /** ISO timestamp of the submission */
  submittedAt: string
  /** Predicted final regular-season order, best first */
  order: string[]
  champion: string
  turd: string
  boldTake?: string
}

export interface ScheduleWeek {
  week: number
  label?: string
  /** team -> opponent */
  opponents: Record<string, string>
}

export interface SeasonData {
  season: number
  source: 'sheet' | 'archive' | 'empty'
  teams: string[]
  weeks: number[]
  /** Last week with reported scores (0 before week 1) */
  lastCompletedWeek: number
  matchups: Matchup[]
  teamWeeks: TeamWeek[]
  playerWeeks: PlayerWeek[]
  standings: TeamStanding[]
  schedule: ScheduleWeek[]
  draft: DraftPick[]
  waivers: WaiverMove[]
  trades: Trade[]
  /** owner -> franchise name for this season, when the sheet supplies one */
  teamNames: Record<string, string>
  /** Submitted starting lineups, latest per week/team/slot */
  lineups: LineupEntry[]
  /** Player Pool tab, when the sheet has one */
  pool: PoolPlayer[]
}
