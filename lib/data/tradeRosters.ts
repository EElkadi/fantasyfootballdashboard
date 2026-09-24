import 'server-only'
import { ROSTERS_TAB, TRADES_TAB, batchUpdateCells, columnLetter, readTabs } from './sheets'
import { canonTeam } from './transform'
import { LoggedTrade, STAMP_HEADER, TradeOutcome, columnDiff, planTrades, tradesFromGrid } from './tradeSync'

export interface TradeSyncResult {
  outcomes: TradeOutcome[]
  /** trades with a roster move still to make or a player to sort out */
  pending: number
  applied: boolean
}

const stampText = () =>
  `✓ ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`

/**
 * Bring the Rosters tab in line with the unstamped trades on the Trades tab.
 * With apply: false it only reports what would change. Rosters are written
 * before any trade is stamped, so a failed write leaves the trades unstamped
 * and the next run simply tries again. Throws on a read or write failure.
 */
export async function syncTradesToRosters({
  apply,
  only,
}: {
  apply: boolean
  /** restrict to some trades, e.g. the one just logged */
  only?: (trade: LoggedTrade) => boolean
}): Promise<TradeSyncResult> {
  const tabs = await readTabs([TRADES_TAB, ROSTERS_TAB])
  const parsed = tradesFromGrid(tabs[TRADES_TAB])
  const { stampCol, hasStampHeader } = parsed
  const trades = only ? parsed.trades.filter(only) : parsed.trades
  const rosterRows = tabs[ROSTERS_TAB]

  const colIndex = new Map<string, number>()
  ;(rosterRows[0] ?? []).forEach((h, i) => {
    const team = canonTeam(h ?? '')
    if (team) colIndex.set(team, i)
  })
  const columns: Record<string, string[]> = {}
  colIndex.forEach((col, team) => {
    columns[team] = rosterRows.slice(1).map((r) => r[col] ?? '')
  })

  const { outcomes, columns: after } = planTrades(trades, columns)
  const pending = outcomes.filter((o) => o.moved.length > 0 || !o.resolved).length
  if (!apply) return { outcomes, pending, applied: false }

  const rosterCells = columnDiff(columns, after).map((d) => ({
    cell: `${columnLetter(colIndex.get(d.team)! + 1)}${d.index + 2}`,
    value: d.value,
  }))
  await batchUpdateCells(ROSTERS_TAB, rosterCells)

  const stamp = stampText()
  const stampLetter = columnLetter(stampCol + 1)
  const tradeCells = outcomes
    .filter((o) => o.resolved)
    .map((o) => ({ cell: `${stampLetter}${o.trade.row}`, value: stamp }))
  if (tradeCells.length > 0 && !hasStampHeader) tradeCells.push({ cell: `${stampLetter}1`, value: STAMP_HEADER })
  await batchUpdateCells(TRADES_TAB, tradeCells)

  return { outcomes, pending: outcomes.filter((o) => !o.resolved).length, applied: true }
}
