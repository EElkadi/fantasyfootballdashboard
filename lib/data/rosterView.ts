import { SeasonData } from '@/lib/types'
import { playerSlug } from '@/lib/players'
import { parseDraftCell } from './transform'

/** How a player got onto the roster, as far as the ledgers know. */
export type Acquisition =
  | { via: 'draft'; round: number; overall: number }
  | { via: 'waiver'; week: number; cost: number }
  | { via: 'trade'; from: string }

export interface RosterPlayer {
  /** Cell text as it appears on the Rosters tab */
  raw: string
  player: string
  nflTeam?: string
  position?: string
  slug: string
  acquired?: Acquisition
}

export interface TeamRoster {
  team: string
  players: RosterPlayer[]
  /** position -> count, for the header summary */
  byPosition: Record<string, number>
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/**
 * Rosters tab + the season's draft/waiver/trade ledgers -> one view per team,
 * with each player tagged by how they were acquired. Pure; see tests.
 */
export function buildRosterView(rosters: Record<string, string[]>, season: SeasonData): TeamRoster[] {
  const drafted = new Map<string, { round: number; overall: number }>()
  for (const p of season.draft) drafted.set(`${p.team}|${playerSlug(p.player)}`, { round: p.round, overall: p.overall })

  const waived = new Map<string, { week: number; cost: number }>()
  for (const m of season.waivers) waived.set(`${m.team}|${playerSlug(m.player)}`, { week: m.week, cost: m.cost }) // later weeks overwrite

  const traded = new Map<string, string>()
  for (const t of season.trades) {
    for (const asset of t.team1Gets) traded.set(`${t.team1}|${playerSlug(parseDraftCell(asset).player)}`, t.team2)
    for (const asset of t.team2Gets) traded.set(`${t.team2}|${playerSlug(parseDraftCell(asset).player)}`, t.team1)
  }

  // Season order first; an owner with a roster column but no games yet still shows
  const teams = season.teams.filter((t) => rosters[t]).concat(Object.keys(rosters).filter((t) => !season.teams.includes(t)))
  return teams.map((team) => {
    const players: RosterPlayer[] = rosters[team].map((raw) => {
      const parsed = parseDraftCell(raw)
      const slug = playerSlug(parsed.player)
      const key = `${team}|${slug}`
      // Most recent kind of move wins: a trade or waiver add postdates the draft
      const trade = traded.get(key)
      const waiver = waived.get(key)
      const pick = drafted.get(key)
      const acquired: Acquisition | undefined = trade
        ? { via: 'trade', from: trade }
        : waiver
          ? { via: 'waiver', ...waiver }
          : pick
            ? { via: 'draft', ...pick }
            : undefined
      return { raw, ...parsed, slug, acquired }
    })
    players.sort((a, b) => {
      const pa = POSITION_ORDER.indexOf(a.position ?? '')
      const pb = POSITION_ORDER.indexOf(b.position ?? '')
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.player.localeCompare(b.player)
    })
    const byPosition: Record<string, number> = {}
    for (const p of players) {
      const pos = p.position ?? '?'
      byPosition[pos] = (byPosition[pos] ?? 0) + 1
    }
    return { team, players, byPosition }
  })
}

export function describeAcquisition(a?: Acquisition): string {
  if (!a) return ''
  if (a.via === 'draft') return `Rd ${a.round} · #${a.overall}`
  if (a.via === 'waiver') return `Waiver wk ${a.week}${a.cost ? ` · $${a.cost}` : ''}`
  return `Trade ← ${a.from}`
}
