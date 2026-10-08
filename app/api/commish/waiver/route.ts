import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { batchUpdateCells, columnLetter, describeSheetsError, hasLiveSheet, readTab, ROSTERS_TAB, WAIVERS_TAB, writeRows } from '@/lib/data/sheets'
import { findOnRoster, replaceOnRoster } from '@/lib/data/rosters'
import { nextWaiverRow, waiverLayout, waiverRow, withDropColumn } from '@/lib/data/waiverRows'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/**
 * Log one waiver move — every add comes with a drop — to the Waiver Wire tab
 * (WEEK | TEAM | PLAYER | COST | DROP), then swap the two on the Rosters tab.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) {
    return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  }
  const body = await req.json().catch(() => null)
  const week = Number(body?.week)
  const owner = resolveOwner(String(body?.team ?? ''))
  const player = String(body?.player ?? '').trim()
  const drop = String(body?.drop ?? '').trim()
  const cost = Number(body?.cost)
  if (!week || week < 1 || week > 18) return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  if (!owner) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })
  if (!player) return NextResponse.json({ error: 'Player is required' }, { status: 400 })
  if (!drop) return NextResponse.json({ error: 'Every add needs a drop — pick who comes off the roster' }, { status: 400 })
  if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: 'Invalid fee' }, { status: 400 })

  // The drop must actually be on this team, so the roster can't silently grow
  let droppedCell: string | null
  try {
    droppedCell = await findOnRoster(owner.name, drop)
  } catch (err) {
    return NextResponse.json({ error: describeSheetsError(err, ROSTERS_TAB) }, { status: 502 })
  }
  if (!droppedCell) {
    return NextResponse.json({ error: `${drop} isn't on ${owner.name}'s roster — pick the drop from their roster` }, { status: 400 })
  }

  try {
    const grid = await readTab(WAIVERS_TAB)
    const { cell, layout } = withDropColumn(waiverLayout(grid[0] ?? []))
    if (cell) await batchUpdateCells(WAIVERS_TAB, [{ cell: `${columnLetter(cell.column + 1)}1`, value: cell.value }])
    await writeRows(WAIVERS_TAB, nextWaiverRow(grid, layout), [
      waiverRow(layout, { week, team: owner.name, player, cost, drop: droppedCell }),
    ])
  } catch (err) {
    console.error('Waiver write failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, WAIVERS_TAB) }, { status: 502 })
  }

  // Keep the Rosters tab (and the parser's name matching) current
  const rosterWarning = await replaceOnRoster(owner.name, droppedCell, player)
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, week, team: owner.name, player, drop: droppedCell, cost, warning: rosterWarning })
}
