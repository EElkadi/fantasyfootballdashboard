import 'server-only'
import { ROSTERS_TAB, readTab, updateCell, columnLetter } from './sheets'
import { canonTeam } from './transform'
import { playerSlug } from '@/lib/players'

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
  if (rows.length === 0) return `The "${ROSTERS_TAB}" tab is empty — update the roster by hand`
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

  const slug = playerSlug(player)
  let row = 1 // 0-based; row 0 is the header
  for (; row < grid.rows.length; row++) {
    const cell = (grid.rows[row][col] ?? '').trim()
    if (!cell) break
    if (playerSlug(cell) === slug) return null // already rostered
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

  const slug = playerSlug(player)
  for (let row = 1; row < grid.rows.length; row++) {
    const cell = (grid.rows[row][col] ?? '').trim()
    if (cell && playerSlug(cell) === slug) {
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
