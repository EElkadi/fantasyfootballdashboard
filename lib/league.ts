/**
 * League-wide configuration: owners, seasons, payouts, playoff format.
 * This is the single place to update when a new season starts.
 */

export interface Owner {
  /** Canonical short name, used everywhere in data and URLs */
  name: string
  /** Franchise/team name (update per season if it changes) */
  teamName: string
  /** Alternate spellings seen in chats and sheets */
  aliases: string[]
  color: string
  /** false for former members who appear only in archived seasons */
  active?: boolean
}

export const OWNERS: Owner[] = [
  { name: 'Paco', teamName: 'We Dem Boyz', aliases: [], color: '#e11d48' },
  { name: 'ATL', teamName: 'A.T.L.', aliases: ['Atole'], color: '#f97316' },
  { name: 'Chuy', teamName: 'Latino Velvet', aliases: ['Zeus'], color: '#16a34a' },
  { name: 'Gaybo', teamName: 'SnakeBite', aliases: [], color: '#0d9488' },
  { name: 'Kenny', teamName: '2 Gurleys, 1 Kupp', aliases: [], color: '#0284c7' },
  { name: 'Elaf', teamName: 'El Facho', aliases: ['Eloy'], color: '#4f46e5' },
  { name: 'Julio', teamName: 'Gunner Galáctico', aliases: ['Bert'], color: '#9333ea' },
  { name: 'Jay', teamName: 'El Buki', aliases: [], color: '#c026d3' },
  { name: 'Monaf', teamName: 'Planet of the Monos', aliases: ['Mono', 'Mo'], color: '#db2777' },
  { name: 'Greg', teamName: 'El Borracho', aliases: [], color: '#65a30d' },
  // Joined for 2026 — set teamName once they name their franchise
  { name: 'Bala', teamName: 'Bala', aliases: ['Bun'], color: '#0891b2' },
  { name: 'Choy', teamName: 'Choy', aliases: [], color: '#7c2d12' },
  // Former members (archived seasons only)
  { name: 'Doy', teamName: 'Crypt Keeper', aliases: [], color: '#a16207', active: false },
  { name: 'Larry', teamName: 'Team Fun', aliases: [], color: '#64748b', active: false },
  { name: 'Marco', teamName: 'Real Narco', aliases: [], color: '#78716c', active: false },
  { name: 'Ivo', teamName: 'The Autumn Wind', aliases: [], color: '#155e75', active: false },
]

export const ACTIVE_OWNERS = OWNERS.filter((o) => o.active !== false)

const aliasIndex = new Map<string, Owner>()
for (const o of OWNERS) {
  aliasIndex.set(o.name.toLowerCase(), o)
  for (const a of o.aliases) aliasIndex.set(a.toLowerCase(), o)
}

/** Resolve any spelling ("Eloy", "mono") to the canonical owner, or undefined. */
export function resolveOwner(name: string): Owner | undefined {
  return aliasIndex.get(name.trim().toLowerCase())
}

export function ownerColor(name: string): string {
  return resolveOwner(name)?.color ?? '#6b7280'
}

export function teamNameOf(name: string): string {
  return resolveOwner(name)?.teamName ?? name
}

export const LEAGUE = {
  name: 'Premier League Fantasy Football',
  /** Absolute origin for links pasted into the chat; override for previews */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.premierleagueff.com').replace(/\/$/, ''),
  since: 2015,
  dues: 300,
  scoringChampPrize: 250,
  payouts: [
    { place: '1st Place', amount: 2010 },
    { place: '2nd Place', amount: 1005 },
    { place: '3rd Place', amount: 335 },
    { place: 'Scoring Champ', amount: 250 },
  ],
  regularSeasonWeeks: 14,
  draftRounds: 20,
  playoffWeeks: [15, 16, 17],
  // Constitution §XVI says six teams with two byes, but the league actually
  // runs seven with a single bye for the #1 seed. Both archived seasons agree:
  // 2024's bracket was #1 bye, #2v#7, #3v#6, #4v#5, and 2025's 2 seed played
  // the 7 seed in a quarterfinal.
  playoffTeams: 7,
  playoffByes: 1,
  turdBowlTeams: 4,
  /** Weeks whose schedule row carries a special label */
  rivalryWeek: 7,
  playoffWeekLabels: {
    15: 'Quarterfinals · Turd Bowl semifinals',
    16: 'Semifinals · Turd Bowl final',
    17: 'Championship · 3rd place game',
  } as Record<number, string>,
} as const

/** The season currently being played (or about to start). */
export const CURRENT_SEASON = Number(process.env.CURRENT_SEASON ?? 2026)

/** Seasons with archived CSV data under data/seasons/<year>/ */
export const ARCHIVED_SEASONS = [2025, 2024]

/**
 * Preseason predictions lock at Week 1 kickoff (the Thursday night game).
 * Set PREDICTIONS_LOCK_AT (ISO 8601) to move it; update the default each year.
 */
export const PREDICTIONS_LOCK_AT = new Date(process.env.PREDICTIONS_LOCK_AT ?? '2026-09-10T20:15:00-04:00')

/** Character cap on a ballot's bold take, enforced by both the form and the API */
export const BOLD_TAKE_MAX = 240

export function predictionsLocked(now: Date = new Date()): boolean {
  return Number.isNaN(PREDICTIONS_LOCK_AT.getTime()) || now >= PREDICTIONS_LOCK_AT
}

/**
 * The pot: 12 × dues plus every waiver fee paid during the season. The
 * scoring champ prize is fixed at $250; the rest splits 60/30/10.
 */
export function computePot(waiverFees: number) {
  const base = LEAGUE.dues * 12
  const pot = base + waiverFees
  const prizePool = pot - LEAGUE.scoringChampPrize
  return {
    base,
    waiverFees,
    pot,
    payouts: [
      { place: '1st Place', amount: Math.round(prizePool * 0.6) },
      { place: '2nd Place', amount: Math.round(prizePool * 0.3) },
      { place: '3rd Place', amount: Math.round(prizePool * 0.1) },
      { place: 'Scoring Champ', amount: LEAGUE.scoringChampPrize },
    ],
  }
}

/** Past champions — extend as history gets filled in. */
export const HONORS: {
  season: number
  champion?: string
  runnerUp?: string
  third?: string
  scoringChamp?: string
  turd?: string
}[] = [
  { season: 2025, champion: 'Chuy', runnerUp: 'Jay', third: 'Paco', scoringChamp: 'Paco', turd: 'Kenny' },
  { season: 2024, champion: 'Julio', runnerUp: 'Chuy', third: 'ATL', scoringChamp: 'Chuy', turd: 'Marco' },
]
