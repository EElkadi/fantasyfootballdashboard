import 'server-only'
import { ROSTERS_TAB, TRADES_TAB, batchUpdateCells, columnLetter, readTabs, writeRows } from './sheets'
import { canonTeam } from './transform'
import {
  LoggedTrade,
  TradeOutcome,
  columnDiff,
  headerAdditions,
  inferSenders,
  nextTradeRow,
  planTrades,
  tradeRows,
  tradesFromGrid,
} from './tradeSync'
import { TradeParty } from '@/lib/types'

export interface TradeSyncResult {
  outcomes: TradeOutcome[]
  /** deals with a roster move still to make or a player to sort out */
  pending: number
  applied: boolean
}

const stampText = () =>
  `✓ ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`

/** Rosters tab rows -> team -> column cells (index 0 = sheet row 2), plus each team's column. */
function rosterColumns(rows: string[][]) {
  const colIndex = new Map<string, number>()
  ;(rows[0] ?? []).forEach((h, i) => {
    const team = canonTeam(h ?? '')
    if (team) colIndex.set(team, i)
  })
  const columns: Record<string, string[]> = {}
  colIndex.forEach((col, team) => {
    columns[team] = rows.slice(1).map((r) => r[col] ?? '')
  })
  return { columns, colIndex }
}

/**
 * Write a two- or three-team deal to the Trades tab, below the last deal.
 * In a three-team deal each player is written with who sent him, worked out
 * from today's rosters. Missing TEAM 3 columns are added to the header.
 * Returns the deal's first sheet row. Throws on a read or write failure.
 */
export async function logTrade(parties: TradeParty[]): Promise<number> {
  const tabs = await readTabs([TRADES_TAB, ROSTERS_TAB])
  const grid = tabs[TRADES_TAB]
  const { columns } = rosterColumns(tabs[ROSTERS_TAB])
  const withSenders = parties.length > 2 ? inferSenders(parties, columns) : parties

  const { cells, layout } = headerAdditions(tradesFromGrid(grid).layout, { parties: parties.length })
  const row = nextTradeRow(grid, layout)
  await batchUpdateCells(
    TRADES_TAB,
    cells.map((c) => ({ cell: `${columnLetter(c.column + 1)}1`, value: c.value })),
  )
  await writeRows(TRADES_TAB, row, tradeRows(withSenders, layout))
  return row
}

/**
 * Bring the Rosters tab in line with the unstamped deals on the Trades tab.
 * With apply: false it only reports what would change. Rosters are written
 * before any deal is stamped, so a failed write leaves the deal unstamped and
 * the next run simply tries again. Unselected deals that need no roster
 * change (pick swaps, or players already moved) are stamped along the way.
 * Throws on a read or write failure.
 */
export async function syncTradesToRosters({
  apply,
  only,
}: {
  apply: boolean
  /** restrict roster moves to some deals, e.g. the one just logged */
  only?: (trade: LoggedTrade) => boolean
}): Promise<TradeSyncResult> {
  const tabs = await readTabs([TRADES_TAB, ROSTERS_TAB])
  const { trades, layout } = tradesFromGrid(tabs[TRADES_TAB])
  const { columns, colIndex } = rosterColumns(tabs[ROSTERS_TAB])

  const selected = only ? trades.filter(only) : trades
  const { outcomes, columns: after } = planTrades(selected, columns)
  const pending = outcomes.filter((o) => o.moved.length > 0 || !o.resolved).length
  if (!apply) return { outcomes, pending, applied: false }

  await batchUpdateCells(
    ROSTERS_TAB,
    columnDiff(columns, after).map((d) => ({
      cell: `${columnLetter(colIndex.get(d.team)! + 1)}${d.index + 2}`,
      value: d.value,
    })),
  )

  // Deals outside the selection that change nothing can be stamped safely
  const idle = only
    ? trades
        .filter((t) => !only(t) && !t.stamped)
        .filter((t) => {
          const [o] = planTrades([t], columns).outcomes
          return o && o.resolved && o.moved.length === 0
        })
    : []

  const toStamp = [...outcomes.filter((o) => o.resolved).map((o) => o.trade.row), ...idle.map((t) => t.row)]
  if (toStamp.length > 0) {
    const header = headerAdditions(layout, { stamp: true })
    const stampLetter = columnLetter(header.layout.stamp + 1)
    const stamp = stampText()
    await batchUpdateCells(TRADES_TAB, [
      ...header.cells.map((c) => ({ cell: `${columnLetter(c.column + 1)}1`, value: c.value })),
      ...toStamp.map((row) => ({ cell: `${stampLetter}${row}`, value: stamp })),
    ])
  }

  return { outcomes, pending: outcomes.filter((o) => !o.resolved).length, applied: true }
}
