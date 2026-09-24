import { canonTeam } from './transform'
import { cellRef, playerSlug } from '@/lib/players'

/**
 * Trades -> Rosters reconciliation, as pure functions over the two tabs.
 *
 * Every trade on the Trades tab gets an "On Rosters" stamp once its players
 * have been moved. Anything unstamped — a trade typed straight into the
 * sheet, or one whose roster write failed — is replayed in tab order against
 * the current rosters: each player moves from the giving team's column to the
 * receiving team's, but only if he is actually on the giving team. That makes
 * a replay safe to repeat, and the stamp keeps a finished trade from ever
 * being replayed over later roster moves.
 */

export const STAMP_HEADER = 'On Rosters'

/** Draft-pick assets ("Round 2, Pick 19", "Monaf's 1st", "2027 R1") have no roster effect. */
export function isPickAsset(asset: string): boolean {
  return /\bpicks?\b|\bround\b|\brd\s*\d|\bR\d{1,2}\b|\b\d+(st|nd|rd|th)\b/i.test(asset)
}

export interface LoggedTrade {
  /** 1-based sheet row of the trade's first line */
  row: number
  team1: string
  team2: string
  team1Gets: string[]
  team2Gets: string[]
  stamped: boolean
}

/** The Trades tab (read from A1) -> trades with their sheet rows and stamp state. */
export function tradesFromGrid(grid: string[][]): { trades: LoggedTrade[]; stampCol: number; hasStampHeader: boolean } {
  const header = (grid[0] ?? []).map((h) => (h ?? '').trim().toLowerCase())
  const find = (name: string) => header.indexOf(name)
  const c = {
    team1: find('team 1'),
    gets1: find('team 1 gets'),
    team2: find('team 2'),
    gets2: find('team 2 gets'),
  }
  // Historical layout is exactly these four columns in order
  const col = {
    team1: c.team1 >= 0 ? c.team1 : 0,
    gets1: c.gets1 >= 0 ? c.gets1 : 1,
    team2: c.team2 >= 0 ? c.team2 : 2,
    gets2: c.gets2 >= 0 ? c.gets2 : 3,
  }
  const existingStamp = find(STAMP_HEADER.toLowerCase())
  const stampCol = existingStamp >= 0 ? existingStamp : Math.max(header.length, 4)

  const cell = (r: string[], i: number) => (r[i] ?? '').trim()
  const split = (v: string) => v.split(';').map((s) => s.trim()).filter(Boolean)
  const trades: LoggedTrade[] = []
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i] ?? []
    const t1 = canonTeam(cell(r, col.team1))
    const t2 = canonTeam(cell(r, col.team2))
    if (t1 && t2) {
      trades.push({ row: i + 1, team1: t1, team2: t2, team1Gets: [], team2Gets: [], stamped: Boolean(cell(r, stampCol)) })
    }
    const current = trades[trades.length - 1]
    if (!current) continue
    current.team1Gets.push(...split(cell(r, col.gets1)))
    current.team2Gets.push(...split(cell(r, col.gets2)))
  }
  return {
    trades: trades.filter((t) => t.team1Gets.length > 0 || t.team2Gets.length > 0),
    stampCol,
    hasStampHeader: existingStamp >= 0,
  }
}

export interface TradeOutcome {
  trade: LoggedTrade
  /** "Josh Allen → Jay" */
  moved: string[]
  /** already on the receiving roster */
  already: string[]
  /** on neither roster column — needs a look */
  missing: string[]
  /** every player accounted for, so the trade can be stamped */
  resolved: boolean
}

/**
 * Replay unstamped trades against roster columns (team -> cells, index 0 =
 * sheet row 2, '' for a blank cell). Removed players leave a blank; added
 * players take the first blank in the receiving column, else go below.
 * Inputs are not mutated.
 */
export function planTrades(
  trades: LoggedTrade[],
  columns: Record<string, string[]>,
): { outcomes: TradeOutcome[]; columns: Record<string, string[]> } {
  const next: Record<string, string[]> = {}
  for (const [team, cells] of Object.entries(columns)) next[team] = [...cells]

  // Matched on name alone: one team never rosters two players of the same
  // name, and the NFL code typed into a trade ("SF") needn't match the
  // pool's ("SFO") or survive the player changing teams.
  const indexOf = (team: string, asset: string) => {
    const slug = playerSlug(cellRef(asset).player)
    return (next[team] ?? []).findIndex((c) => c.trim() !== '' && playerSlug(cellRef(c).player) === slug)
  }

  const outcomes: TradeOutcome[] = []
  for (const trade of trades) {
    if (trade.stamped) continue
    const outcome: TradeOutcome = { trade, moved: [], already: [], missing: [], resolved: true }
    const sides: [string[], string, string][] = [
      [trade.team1Gets, trade.team2, trade.team1],
      [trade.team2Gets, trade.team1, trade.team2],
    ]
    for (const [assets, from, to] of sides) {
      for (const asset of assets) {
        if (isPickAsset(asset)) continue
        const at = indexOf(from, asset)
        if (at >= 0 && next[to]) {
          const cellText = next[from][at]
          next[from][at] = ''
          const gap = next[to].findIndex((c) => c.trim() === '')
          if (gap >= 0) next[to][gap] = cellText
          else next[to].push(cellText)
          outcome.moved.push(`${cellRef(cellText).player} → ${to}`)
        } else if (indexOf(to, asset) >= 0) {
          outcome.already.push(cellRef(asset).player)
        } else {
          outcome.missing.push(asset)
          outcome.resolved = false
        }
      }
    }
    outcomes.push(outcome)
  }
  return { outcomes, columns: next }
}

/** Cells that differ between two column sets, as { team, index, value }. */
export function columnDiff(
  before: Record<string, string[]>,
  after: Record<string, string[]>,
): { team: string; index: number; value: string }[] {
  const out: { team: string; index: number; value: string }[] = []
  for (const [team, cells] of Object.entries(after)) {
    const old = before[team] ?? []
    for (let i = 0; i < Math.max(cells.length, old.length); i++) {
      const a = (old[i] ?? '').trim()
      const b = (cells[i] ?? '').trim()
      if (a !== b) out.push({ team, index: i, value: cells[i] ?? '' })
    }
  }
  return out
}
