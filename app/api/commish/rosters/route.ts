import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { isCommish } from '@/lib/commish/auth'
import { DRAFT_TAB, TEAMS_TAB, describeSheetsError, hasLiveSheet, readTabs, toObjects } from '@/lib/data/sheets'
import { gridToDraft } from '@/lib/data/transform'
import { syncRostersFromDraft } from '@/lib/data/rosters'

export const dynamic = 'force-dynamic'

/**
 * Add every drafted player missing from the Rosters tab. Idempotent. Reads
 * the board straight from the sheet — never from the cached season, which
 * could be a stale copy or the committed seed files.
 */
export async function POST() {
  if (!isCommish()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  let picks
  try {
    const tabs = await readTabs([DRAFT_TAB, TEAMS_TAB])
    picks = gridToDraft(tabs[DRAFT_TAB], toObjects(tabs[TEAMS_TAB]))
  } catch (err) {
    return NextResponse.json({ error: describeSheetsError(err, DRAFT_TAB) }, { status: 502 })
  }
  if (picks.length === 0) return NextResponse.json({ error: 'No draft picks on the board yet' }, { status: 400 })
  const result = await syncRostersFromDraft(picks)
  if (result.failed) return NextResponse.json({ error: result.warning ?? 'Roster sync failed' }, { status: 502 })
  revalidateTag('season-live')
  const count = Object.values(result.added).reduce((s, list) => s + list.length, 0)
  return NextResponse.json({ ok: true, count, added: result.added, warning: result.warning })
}
