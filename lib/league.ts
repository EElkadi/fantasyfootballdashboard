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
}

export const OWNERS: Owner[] = [
  { name: 'Paco', teamName: 'We Dem Boyz', aliases: [], color: '#e11d48' },
  { name: 'ATL', teamName: 'A.T.L.', aliases: [], color: '#f97316' },
  { name: 'Doy', teamName: 'Crypt Keeper', aliases: [], color: '#a16207' },
  { name: 'Chuy', teamName: 'Latino Velvet', aliases: [], color: '#16a34a' },
  { name: 'Gaybo', teamName: 'SnakeBite', aliases: [], color: '#0d9488' },
  { name: 'Kenny', teamName: '2 Gurleys, 1 Kupp', aliases: [], color: '#0284c7' },
  { name: 'Elaf', teamName: 'El Facho', aliases: ['Eloy'], color: '#4f46e5' },
  { name: 'Julio', teamName: 'Gunner Galáctico', aliases: [], color: '#9333ea' },
  { name: 'Jay', teamName: 'El Buki', aliases: [], color: '#c026d3' },
  { name: 'Monaf', teamName: 'Planet of the Monos', aliases: ['Mono'], color: '#db2777' },
  { name: 'Greg', teamName: 'El Borracho', aliases: [], color: '#65a30d' },
  { name: 'Larry', teamName: 'Team Fun', aliases: [], color: '#64748b' },
]

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
  since: 2015,
  dues: 300,
  payouts: [
    { place: '1st Place', amount: 2010 },
    { place: '2nd Place', amount: 1005 },
    { place: '3rd Place', amount: 335 },
    { place: 'Scoring Champ', amount: 250 },
  ],
  regularSeasonWeeks: 14,
  playoffWeeks: [15, 16, 17],
  playoffTeams: 6,
  playoffByes: 2,
  turdBowlTeams: 4,
  /** Weeks whose schedule row carries a special label */
  rivalryWeek: 7,
} as const

/** The season currently being played (or about to start). */
export const CURRENT_SEASON = Number(process.env.CURRENT_SEASON ?? 2026)

/** Seasons with archived CSV data under data/seasons/<year>/ */
export const ARCHIVED_SEASONS = [2025]

/** Past champions — extend as history gets filled in. */
export const HONORS: { season: number; champion?: string; runnerUp?: string; scoringChamp?: string; turd?: string }[] = []
