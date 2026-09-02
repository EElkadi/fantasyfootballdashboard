import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { appendRows, describeSheetsError, hasLiveSheet, LINEUPS_TAB } from '@/lib/data/sheets'
import { canonSlot } from '@/lib/data/transform'
import { resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/**
 * Record submitted starting lineups: one `Week | Team | Slot | Player |
 * Submitted` row per slot. Rows are only ever appended, so a Thursday
 * partial followed by Sunday's full lineup leaves an audit trail and the
 * reader takes the latest row per slot.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => null)
  const week = Number(body?.week)
  if (!week || week < 1 || week > 18) return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  const lineups: unknown[] = Array.isArray(body?.lineups) ? body.lineups : []
  if (lineups.length === 0) return NextResponse.json({ error: 'No lineups to save' }, { status: 400 })

  const stamp = new Date().toISOString()
  const rows: (string | number)[][] = []
  const saved: Record<string, number> = {}
  for (const l of lineups as { team?: unknown; players?: unknown }[]) {
    const owner = resolveOwner(String(l.team ?? ''))
    if (!owner) return NextResponse.json({ error: 'Every lineup needs a team' }, { status: 400 })
    const players: { slot?: unknown; name?: unknown }[] = Array.isArray(l.players) ? l.players : []
    const seen = new Set<string>()
    for (const p of players) {
      const slot = canonSlot(String(p.slot ?? ''))
      const name = String(p.name ?? '').replace(/\s+/g, ' ').trim()
      if (!slot || !name) continue
      if (seen.has(slot)) return NextResponse.json({ error: `${owner.name} has ${slot} twice` }, { status: 400 })
      seen.add(slot)
      rows.push([week, owner.name, slot, name, stamp])
    }
    if (seen.size > 0) saved[owner.name] = seen.size
  }
  if (rows.length === 0) return NextResponse.json({ error: 'No players to save' }, { status: 400 })

  try {
    await appendRows(LINEUPS_TAB, rows, { raw: true })
  } catch (err) {
    console.error('Lineup append failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, LINEUPS_TAB) }, { status: 502 })
  }
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, week, saved })
}
