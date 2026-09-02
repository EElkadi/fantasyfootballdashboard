import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { leaguePasscodeConfigured, verifyLeaguePasscode } from '@/lib/commish/auth'
import { appendRow, describeSheetsError, hasLiveSheet, PREDICTIONS_TAB } from '@/lib/data/sheets'
import { ACTIVE_OWNERS, BOLD_TAKE_MAX, predictionsLocked, resolveOwner } from '@/lib/league'

export const dynamic = 'force-dynamic'

/**
 * Submit a preseason ballot: Submitted | Manager | Order | Champion | Turd | Bold Take.
 * Anyone with the league passcode can submit under any active manager's
 * name; resubmitting before the lock replaces the earlier ballot.
 */
export async function POST(req: Request) {
  if (predictionsLocked()) return NextResponse.json({ error: 'Predictions are locked — the season has started' }, { status: 403 })
  if (!hasLiveSheet()) return NextResponse.json({ error: 'Google Sheet is not configured' }, { status: 501 })
  if (!leaguePasscodeConfigured()) {
    return NextResponse.json({ error: 'League passcode is not configured (set LEAGUE_PASSCODE)' }, { status: 501 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.passcode !== 'string' || !verifyLeaguePasscode(body.passcode)) {
    return NextResponse.json({ error: 'Wrong league passcode' }, { status: 401 })
  }

  const active = new Set(ACTIVE_OWNERS.map((o) => o.name))
  const canon = (v: unknown) => {
    const owner = resolveOwner(String(v ?? ''))
    return owner && active.has(owner.name) ? owner.name : null
  }
  const manager = canon(body.manager)
  if (!manager) return NextResponse.json({ error: 'Pick your name' }, { status: 400 })

  const order = Array.isArray(body.order) ? body.order.map(canon) : []
  if (order.length !== active.size || order.some((t: string | null) => !t) || new Set(order).size !== active.size) {
    return NextResponse.json({ error: 'Order must rank all twelve teams exactly once' }, { status: 400 })
  }
  const champion = canon(body.champion)
  const turd = canon(body.turd)
  if (!champion || !turd) return NextResponse.json({ error: 'Pick a champion and a Turd' }, { status: 400 })
  if (champion === turd) return NextResponse.json({ error: 'The champion cannot also be the Turd' }, { status: 400 })

  const boldTake = String(body.boldTake ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BOLD_TAKE_MAX)

  try {
    // RAW: the bold take is league-member text, never to be parsed as a formula
    await appendRow(PREDICTIONS_TAB, [new Date().toISOString(), manager, order.join(', '), champion, turd, boldTake], {
      raw: true,
    })
  } catch (err) {
    console.error('Prediction append failed:', err)
    return NextResponse.json({ error: `Saving failed — tell the commish: ${describeSheetsError(err, PREDICTIONS_TAB)}` }, { status: 502 })
  }
  revalidateTag('predictions')
  return NextResponse.json({ ok: true, manager })
}
