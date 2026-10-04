import { MAX_TRADE_TEAMS, formatTradeAsset, groupTradeRows } from './transform'
import { cellRef, playerSlug } from '@/lib/players'
import { TradeParty } from '@/lib/types'

/**
 * Trades -> Rosters reconciliation, as pure functions over the two tabs.
 *
 * The Trades tab holds two- and three-team deals side by side:
 *   TEAM 1 | TEAM 1 GETS | TEAM 2 | TEAM 2 GETS | TEAM 3 | TEAM 3 GETS | On Rosters
 * located by header, so column order doesn't matter. Every deal gets an "On
 * Rosters" stamp once its players have moved. Anything unstamped — a deal
 * typed straight into the sheet, or one whose roster write failed — is
 * replayed in tab order against the current rosters: each player moves to the
 * receiving team from whichever other party in the deal has him. Replays are
 * safe to repeat, and the stamp keeps a finished deal from ever being
 * replayed over later roster moves.
 */

export const STAMP_HEADER = 'On Rosters'

/** Draft-pick assets ("Round 2, Pick 19", "Monaf's 1st", "2027 R1") have no roster effect. */
export function isPickAsset(asset: string): boolean {
  return /\bpicks?\b|\bround\b|\brd\s*\d|\bR\d{1,2}\b|\b\d+(st|nd|rd|th)\b/i.test(asset)
}

export interface LoggedTrade {
  /** 1-based sheet row of the deal's first line */
  row: number
  parties: TradeParty[]
  stamped: boolean
}

/** Where each Trades column lives (0-based; -1 when the tab has none). */
export interface TradeLayout {
  /** TEAM n at index n - 1 */
  team: number[]
  /** TEAM n GETS at index n - 1 */
  gets: number[]
  stamp: number
  /** one past the last named header cell */
  width: number
  /** header written in capitals ("TEAM 1") rather than "Team 1" */
  upper: boolean
}

const slots = Array.from({ length: MAX_TRADE_TEAMS }, (_, i) => i + 1)

export function tradeLayout(header: string[]): TradeLayout {
  const names = header.map((h) => (h ?? '').trim().toLowerCase())
  const width = names.reduce((w, h, i) => (h ? i + 1 : w), 0)
  const team = slots.map((n) => names.indexOf(`team ${n}`))
  const gets = slots.map((n) => names.indexOf(`team ${n} gets`))
  // A header row with none of the names is the historical bare layout
  if (width > 0 && team[0] < 0 && gets[0] < 0) {
    team.splice(0, 2, 0, 2)
    gets.splice(0, 2, 1, 3)
  }
  const named = header.find((h) => /team\s*1/i.test(h ?? ''))
  return { team, gets, stamp: names.indexOf(STAMP_HEADER.toLowerCase()), width, upper: named ? named === named.toUpperCase() : true }
}

/** The Trades tab (read from A1) -> deals with their sheet rows and stamp state. */
export function tradesFromGrid(grid: string[][]): { trades: LoggedTrade[]; layout: TradeLayout } {
  const layout = tradeLayout(grid[0] ?? [])
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const rows = grid.slice(1).map((r, i) => ({
    row: i + 2,
    stamp: cell(r ?? [], layout.stamp),
    teams: layout.team.map((c) => cell(r ?? [], c)),
    gets: layout.gets.map((c) => cell(r ?? [], c)),
  }))
  const trades = groupTradeRows(rows).map(({ trade, first }) => ({
    row: first.row,
    parties: trade.parties,
    stamped: Boolean(first.stamp),
  }))
  return { trades, layout }
}

/**
 * Header cells a write needs: the TEAM/GETS pair for each party slot in use
 * and, when stamping, "On Rosters" — each missing one added after the last
 * named header. Returns the cells to write and the layout once they exist.
 */
export function headerAdditions(
  layout: TradeLayout,
  { parties = 0, stamp = false }: { parties?: number; stamp?: boolean },
): { cells: { column: number; value: string }[]; layout: TradeLayout } {
  const next: TradeLayout = { ...layout, team: [...layout.team], gets: [...layout.gets] }
  const cells: { column: number; value: string }[] = []
  const add = (label: string) => {
    const column = next.width++
    cells.push({ column, value: next.upper ? label.toUpperCase() : label })
    return column
  }
  for (let n = 1; n <= parties; n++) {
    if (next.team[n - 1] < 0) next.team[n - 1] = add(`Team ${n}`)
    if (next.gets[n - 1] < 0) next.gets[n - 1] = add(`Team ${n} Gets`)
  }
  if (stamp && next.stamp < 0) next.stamp = add(STAMP_HEADER)
  return { cells, layout: next }
}

/** 1-based row for a new deal: just below the last row holding any trade data. */
export function nextTradeRow(grid: string[][], layout: TradeLayout): number {
  const used = [...layout.team, ...layout.gets, layout.stamp].filter((c) => c >= 0)
  let last = 1
  grid.forEach((r, i) => {
    if (i > 0 && used.some((c) => (r?.[c] ?? '').trim())) last = i + 1
  })
  return last + 1
}

/** A deal as sheet rows under `layout`: team names on the first row, one asset per row per party. */
export function tradeRows(parties: TradeParty[], layout: TradeLayout): string[][] {
  const width = Math.max(...layout.team, ...layout.gets) + 1
  const height = Math.max(...parties.map((p) => p.gets.length))
  return Array.from({ length: height }, (_, i) => {
    const row: string[] = Array(width).fill('')
    parties.forEach((p, n) => {
      if (i === 0) row[layout.team[n]] = p.team
      const g = p.gets[i]
      if (g) row[layout.gets[n]] = formatTradeAsset(g, parties.length)
    })
    return row
  })
}

/** Index of a player in a roster column, matched on name alone (see planTrades). */
function rosterIndex(column: string[] | undefined, asset: string): number {
  const slug = playerSlug(cellRef(asset).player)
  return (column ?? []).findIndex((c) => c.trim() !== '' && playerSlug(cellRef(c).player) === slug)
}

/** Teams to look in for an asset's sender: the recorded one first, then the rest of the deal. */
function sendersFor(parties: TradeParty[], to: string, from?: string): string[] {
  const others = parties.map((p) => p.team).filter((t) => t !== to)
  return from && others.includes(from) ? [from, ...others.filter((t) => t !== from)] : others
}

/**
 * Fill in who sent each player in a deal of three or more, from the roster
 * that has him today. Picks and players nobody has are left as typed.
 */
export function inferSenders(parties: TradeParty[], columns: Record<string, string[]>): TradeParty[] {
  return parties.map((p) => ({
    team: p.team,
    gets: p.gets.map((g) => {
      if (g.from || isPickAsset(g.asset)) return g
      const from = sendersFor(parties, p.team).find((t) => rosterIndex(columns[t], g.asset) >= 0)
      return from ? { ...g, from } : g
    }),
  }))
}

export interface TradeOutcome {
  trade: LoggedTrade
  /** "Josh Allen: Jay → Paco" */
  moved: string[]
  /** already on the receiving roster */
  already: string[]
  /** on no roster in the deal — needs a look */
  missing: string[]
  /** every player accounted for, so the deal can be stamped */
  resolved: boolean
}

/**
 * Replay unstamped deals against roster columns (team -> cells, index 0 =
 * sheet row 2, '' for a blank cell). Players are matched on name alone: one
 * team never rosters two players of the same name, and the NFL code typed
 * into a trade ("SF") needn't match the pool's ("SFO"). A removed player
 * leaves a blank; an added one takes the first blank in the receiving
 * column, else goes below. Inputs are not mutated.
 */
export function planTrades(
  trades: LoggedTrade[],
  columns: Record<string, string[]>,
): { outcomes: TradeOutcome[]; columns: Record<string, string[]> } {
  const next: Record<string, string[]> = {}
  for (const [team, cells] of Object.entries(columns)) next[team] = [...cells]

  const outcomes: TradeOutcome[] = []
  for (const trade of trades) {
    if (trade.stamped) continue
    const outcome: TradeOutcome = { trade, moved: [], already: [], missing: [], resolved: true }
    // Everyone sends first, then everyone receives, so incoming players
    // fill the slots outgoing ones just left
    const arrivals: { to: string; cellText: string }[] = []
    for (const party of trade.parties) {
      const to = party.team
      for (const { asset, from } of party.gets) {
        if (isPickAsset(asset)) continue
        const giver = next[to] ? sendersFor(trade.parties, to, from).find((t) => rosterIndex(next[t], asset) >= 0) : undefined
        if (giver) {
          const at = rosterIndex(next[giver], asset)
          const cellText = next[giver][at]
          next[giver][at] = ''
          arrivals.push({ to, cellText })
          outcome.moved.push(`${cellRef(cellText).player}: ${giver} → ${to}`)
        } else if (rosterIndex(next[to], asset) >= 0) {
          outcome.already.push(cellRef(asset).player)
        } else {
          outcome.missing.push(asset)
          outcome.resolved = false
        }
      }
    }
    for (const { to, cellText } of arrivals) {
      const gap = next[to].findIndex((c) => c.trim() === '')
      if (gap >= 0) next[to][gap] = cellText
      else next[to].push(cellText)
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
