import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { batchUpdateCells, columnLetter, describeSheetsError, hasLiveSheet, readTab, WAIVERS_TAB } from '@/lib/data/sheets'
import { findOnRoster, removeFromRoster } from '@/lib/data/rosters'
import { undroppedRow, waiverLayout, withDropColumn } from '@/lib/data/waiverRows'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/**
 * Record the drop for an add logged before drops were required. Writes the
 * DROP cell on that add's row and, if the player is still on the team's
 * roster, takes him off.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => null)
  const week = Number(body?.week)
  const owner = resolveOwner(String(body?.team ?? ''))
  const player = String(body?.player ?? '').trim()
  const drop = String(body?.drop ?? '').trim()
  if (!week || !owner || !player) return NextResponse.json({ error: 'Which add is this for?' }, { status: 400 })
  if (!drop) return NextResponse.json({ error: 'Name the dropped player' }, { status: 400 })

  try {
    const grid = await readTab(WAIVERS_TAB)
    const { cell, layout } = withDropColumn(waiverLayout(grid[0] ?? []))
    const row = undroppedRow(grid, layout, { week, team: owner.name, player })
    if (row < 0) {
      return NextResponse.json({ error: `Couldn't find ${owner.name}'s week ${week} add of ${player} without a drop` }, { status: 404 })
    }
    // Write the roster's own cell text when he's still on it, else as typed
    const onRoster = await findOnRoster(owner.name, drop)
    const letter = columnLetter(layout.drop + 1)
    await batchUpdateCells(WAIVERS_TAB, [
      ...(cell ? [{ cell: `${columnLetter(cell.column + 1)}1`, value: cell.value }] : []),
      { cell: `${letter}${row}`, value: onRoster ?? drop },
    ])
    const warning = onRoster ? await removeFromRoster(owner.name, onRoster) : null
    revalidateTag('season-live')
    return NextResponse.json({ ok: true, row, drop: onRoster ?? drop, removed: Boolean(onRoster), warning })
  } catch (err) {
    console.error('Waiver drop write failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, WAIVERS_TAB) }, { status: 502 })
  }
}
