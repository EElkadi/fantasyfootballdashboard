import { canonTeam } from './transform'

/**
 * Where a matchup belongs on the Scores tab.
 *
 * Google's `values:append` puts a row after the last row it considers part of
 * the "table", and anything further down the tab — pre-typed week numbers,
 * formulas copied down, stray formatting — drags that point far below the
 * real data. So the row is chosen here from what the tab actually holds:
 *
 *   1. The row already holding this week's meeting of these two teams (either
 *      order) — re-saving a matchup corrects it instead of duplicating it.
 *   2. The first row already marked with this week whose team cells are blank
 *      (a tab laid out in advance with week numbers down column A).
 *   3. The first row whose week and team cells are all blank.
 *   4. Otherwise the row just below the last one returned.
 *
 * `grid` is the tab read from A1, so grid[i] is sheet row i + 1. Returns a
 * 1-based sheet row.
 */
export function scoreRowFor(
  grid: string[][],
  week: number,
  team1: string,
  team2: string,
): { row: number; replacing: boolean } {
  const header = (grid[0] ?? []).map((h) => (h ?? '').trim().toLowerCase())
  const col = (name: string, fallback: number) => {
    const i = header.indexOf(name)
    return i >= 0 ? i : fallback
  }
  // Historical 43-column layout: Week, Team 1, 9 slot pairs, Total1, Team 2, ...
  const weekCol = col('week', 0)
  const team1Col = col('team 1', 1)
  const team2Col = col('team 2', 21)

  const cell = (r: string[], i: number) => (r[i] ?? '').trim()
  const pair = new Set([canonTeam(team1), canonTeam(team2)])
  let weekSlot = -1
  let blankSlot = -1

  for (let i = 1; i < grid.length; i++) {
    const r = grid[i] ?? []
    const w = parseInt(cell(r, weekCol))
    const t1 = cell(r, team1Col)
    const t2 = cell(r, team2Col)
    if (w === week && t1 && t2 && pair.has(canonTeam(t1)) && pair.has(canonTeam(t2)) && canonTeam(t1) !== canonTeam(t2)) {
      return { row: i + 1, replacing: true }
    }
    if (!t1 && !t2) {
      if (w === week && weekSlot < 0) weekSlot = i
      if (!cell(r, weekCol) && blankSlot < 0) blankSlot = i
    }
  }
  if (weekSlot >= 0) return { row: weekSlot + 1, replacing: false }
  if (blankSlot >= 0) return { row: blankSlot + 1, replacing: false }
  return { row: Math.max(grid.length, 1) + 1, replacing: false }
}
