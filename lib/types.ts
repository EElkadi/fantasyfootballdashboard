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
  total: number
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
  team: string
  player: string
  nflTeam?: string
  position?: string
}

export interface WaiverMove {
  week: number
  team: string
  player: string
  nflTeam?: string
  position?: string
  cost: number
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
}
