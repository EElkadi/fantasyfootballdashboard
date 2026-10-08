import { canonTeam } from './transform'
import { cellRef, playerSlug } from '@/lib/players'

/**
 * Waiver Wire tab layout: WEEK | TEAM | PLAYER | COST | DROP, located by
 * header so column order doesn't matter. Every add carries the player cut to
 * make room; the DROP column is added to the header the first time it's
 * needed. Pure — see tests/sheet-writes.test.ts.
 */

export const DROP_HEADER = 'Drop'

export interface WaiverLayout {
  week: number
  team: number
  player: number
  cost: number
  /** -1 until the tab has a DROP column */
  drop: number
  /** one past the last named header cell */
  width: number
  upper: boolean
}

export function waiverLayout(header: string[]): WaiverLayout {
  const names = header.map((h) => (h ?? '').trim().toLowerCase())
  const at = (name: string, fallback: number) => {
    const i = names.indexOf(name)
    return i >= 0 ? i : fallback
  }
  const named = header.find((h) => /week/i.test(h ?? ''))
  return {
    week: at('week', 0),
    team: at('team', 1),
    player: at('player', 2),
    cost: at('cost', 3),
    drop: names.findIndex((h) => /^drop(ped|s)?$/.test(h)),
    width: Math.max(names.reduce((w, h, i) => (h ? i + 1 : w), 0), 4),
    upper: named ? named === named.toUpperCase() : true,
  }
}

/** The DROP header cell to write, if the tab lacks one, and the layout once it exists. */
export function withDropColumn(layout: WaiverLayout): { cell?: { column: number; value: string }; layout: WaiverLayout } {
  if (layout.drop >= 0) return { layout }
  const column = layout.width
  return {
    cell: { column, value: layout.upper ? DROP_HEADER.toUpperCase() : DROP_HEADER },
    layout: { ...layout, drop: column, width: column + 1 },
  }
}

const cell = (r: string[] | undefined, i: number) => (i >= 0 ? (r?.[i] ?? '').trim() : '')

/** 1-based row for a new add: just below the last row holding a move. */
export function nextWaiverRow(grid: string[][], layout: WaiverLayout): number {
  let last = 1
  grid.forEach((r, i) => {
    if (i > 0 && (cell(r, layout.team) || cell(r, layout.player))) last = i + 1
  })
  return last + 1
}

/** One add as a sheet row under `layout`. */
export function waiverRow(
  layout: WaiverLayout,
  move: { week: number; team: string; player: string; cost: number; drop: string },
): (string | number)[] {
  const row: (string | number)[] = Array(Math.max(layout.width, layout.drop + 1)).fill('')
  row[layout.week] = move.week
  row[layout.team] = move.team
  row[layout.player] = move.player
  row[layout.cost] = move.cost
  row[layout.drop] = move.drop
  return row
}

const samePlayerName = (a: string, b: string) => playerSlug(cellRef(a).player) === playerSlug(cellRef(b).player)

/** 1-based row of a logged add that has no drop recorded yet, or -1. */
export function undroppedRow(
  grid: string[][],
  layout: WaiverLayout,
  move: { week: number; team: string; player: string },
): number {
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i]
    if (
      parseInt(cell(r, layout.week)) === move.week &&
      canonTeam(cell(r, layout.team)) === canonTeam(move.team) &&
      samePlayerName(cell(r, layout.player), move.player) &&
      !cell(r, layout.drop)
    ) {
      return i + 1
    }
  }
  return -1
}
