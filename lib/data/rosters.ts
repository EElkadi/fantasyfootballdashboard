import 'server-only'
import { ROSTERS_TAB, readTab, updateCell, updateRow, batchUpdateCells, columnLetter } from './sheets'
import { canonTeam } from './transform'
import { cellRef, missingFromRosters, samePlayer } from '@/lib/players'
import { DraftPick } from '@/lib/types'
import { ACTIVE_OWNERS } from '@/lib/league'

/**
 * Best-effort upkeep of the Rosters tab (one column per team, players
 * listed below the header) so the WhatsApp parser's name matching stays
 * current as waivers and trades happen. Every function returns a warning
 * string instead of throwing — roster sync must never fail the transaction
 * that triggered it.
 */

interface RosterGrid {
  rows: string[][]
  /** team -> 0-based column index */
  columns: Map<string, number>
}

async function readGrid(): Promise<RosterGrid | string> {
  let rows: string[][]
  try {
    rows = await readTab(ROSTERS_TAB)
  } catch {
    return `Couldn't read the "${ROSTERS_TAB}" tab — update the roster by hand`
  }
  if (rows.length === 0) {
    // A blank tab (draft night on a fresh workbook): lay down the header row
    // so the first pick has somewhere to go.
    const header = ACTIVE_OWNERS.map((o) => o.name)
    try {
      await updateRow(ROSTERS_TAB, 1, header)
    } catch {
      return `The "${ROSTERS_TAB}" tab is empty and couldn't be initialised — update the roster by hand`
    }
    rows = [header]
  }
  const columns = new Map<string, number>()
  rows[0].forEach((header, i) => {
    const team = canonTeam(header)
    if (team) columns.set(team, i)
  })
  return { rows, columns }
}

/** Add a player to a team's roster column (first empty cell). */
export async function addToRoster(team: string, player: string): Promise<string | null> {
  const grid = await readGrid()
  if (typeof grid === 'string') return grid
  const owner = canonTeam(team)
  const col = grid.columns.get(owner)
  if (col === undefined) return `No "${owner}" column on the ${ROSTERS_TAB} tab — add ${player} by hand`

  const ref = cellRef(player)
  let row = 1 // 0-based; row 0 is the header
  for (; row < grid.rows.length; row++) {
    const cell = (grid.rows[row][col] ?? '').trim()
    if (!cell) break
    // "Bijan Robinson ATL RB", "Bijan Robinson (RB, ATL)" and "Bijan Robinson" are one player
    if (samePlayer(cellRef(cell), ref)) return null // already rostered
  }
  try {
    await updateCell(ROSTERS_TAB, `${columnLetter(col + 1)}${row + 1}`, player)
    return null
  } catch {
    return `Couldn't write ${player} to ${owner}'s roster — add them by hand`
  }
}

/** Clear a player from a team's roster column (exact name match after normalization). */
export async function removeFromRoster(team: string, player: string): Promise<string | null> {
  const grid = await readGrid()
  if (typeof grid === 'string') return grid
  const owner = canonTeam(team)
  const col = grid.columns.get(owner)
  if (col === undefined) return `No "${owner}" column on the ${ROSTERS_TAB} tab`

  const ref = cellRef(player)
  for (let row = 1; row < grid.rows.length; row++) {
    const cell = (grid.rows[row][col] ?? '').trim()
    if (cell && samePlayer(cellRef(cell), ref)) {
      try {
        await updateCell(ROSTERS_TAB, `${columnLetter(col + 1)}${row + 1}`, '')
        return null
      } catch {
        return `Couldn't remove ${player} from ${owner}'s roster — clear the cell by hand`
      }
    }
  }
  return `${player} wasn't found on ${owner}'s roster column — check the ${ROSTERS_TAB} tab`
}

/**
 * Make sure every drafted player is on their team's roster column. Picks
 * write to the roster best-effort, so a rate-limited burst (a rapid fill-in
 * after the draft) can leave gaps — this closes them in one write.
 */
export async function syncRostersFromDraft(
  picks: DraftPick[],
): Promise<{ added: Record<string, string[]>; warning: string | null; failed: boolean }> {
  const grid = await readGrid()
  if (typeof grid === 'string') return { added: {}, warning: grid, failed: true }
  const rosters: Record<string, string[]> = {}
  grid.columns.forEach((col, team) => {
    rosters[team] = grid.rows.slice(1).map((r) => (r[col] ?? '').trim()).filter(Boolean)
  })
  const missing = missingFromRosters(picks, rosters)
  const cells: { cell: string; value: string }[] = []
  const added: Record<string, string[]> = {}
  const noColumn: string[] = []
  for (const [team, players] of Object.entries(missing)) {
    const col = grid.columns.get(team)
    if (col === undefined) {
      noColumn.push(team)
      continue
    }
    // Fill the column's gaps first (an undo or trade leaves blanks mid-column),
    // then append below the last occupied row — never over an existing name
    const empties: number[] = []
    for (let row = 1; row < grid.rows.length; row++) if (!(grid.rows[row][col] ?? '').trim()) empties.push(row)
    let next = grid.rows.length
    for (const player of players) {
      const row = empties.length ? empties.shift()! : next++
      cells.push({ cell: `${columnLetter(col + 1)}${row + 1}`, value: player })
    }
    added[team] = players
  }
  if (cells.length > 0) {
    try {
      await batchUpdateCells(ROSTERS_TAB, cells)
    } catch {
      return {
        added: {},
        warning: `Couldn't write ${cells.length} roster cell${cells.length === 1 ? '' : 's'} — try again`,
        failed: true,
      }
    }
  }
  return { added, warning: noColumn.length ? `No roster column for ${noColumn.join(', ')}` : null, failed: false }
}
