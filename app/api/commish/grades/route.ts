import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { describeSheetsError, GRADES_TAB, hasLiveSheet, writeRange } from '@/lib/data/sheets'
import { ACTIVE_OWNERS, resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/**
 * Save the league's post-draft verdict: one row per team on the Draft Grades
 * tab (Team | Grade | Best Pick | Worst Pick | Notes). The whole block is
 * rewritten each save so the tab always mirrors the form.
 */
export async function POST(req: Request) {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })

  const body = await req.json().catch(() => null)
  const input: unknown[] = Array.isArray(body?.grades) ? body.grades : []
  const active = new Set(ACTIVE_OWNERS.map((o) => o.name))
  const rows: (string | number)[][] = [['Team', 'Grade', 'Best Pick', 'Worst Pick', 'Notes']]
  const seen = new Set<string>()
  for (const g of input as { team?: unknown; grade?: unknown; bestPick?: unknown; worstPick?: unknown; notes?: unknown }[]) {
    const owner = resolveOwner(String(g.team ?? ''))
    if (!owner || !active.has(owner.name)) return NextResponse.json({ error: `Unknown team "${g.team}"` }, { status: 400 })
    if (seen.has(owner.name)) return NextResponse.json({ error: `${owner.name} appears twice` }, { status: 400 })
    seen.add(owner.name)
    const grade = Number(g.grade)
    if (!Number.isFinite(grade) || grade < 0 || grade > 10) {
      return NextResponse.json({ error: `${owner.name}: grade must be 0–10` }, { status: 400 })
    }
    const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
    rows.push([owner.name, grade, clean(g.bestPick, 80), clean(g.worstPick, 80), clean(g.notes, 240)])
  }
  if (rows.length === 1) return NextResponse.json({ error: 'No grades to save' }, { status: 400 })

  try {
    await writeRange(GRADES_TAB, rows)
  } catch (err) {
    console.error('Grades write failed:', err)
    return NextResponse.json({ error: describeSheetsError(err, GRADES_TAB) }, { status: 502 })
  }
  revalidateTag('season-live')
  return NextResponse.json({ ok: true, saved: rows.length - 1 })
}
