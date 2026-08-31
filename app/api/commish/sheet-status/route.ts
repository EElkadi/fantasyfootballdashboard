import { NextResponse } from 'next/server'
import { isCommish } from '@/lib/commish/auth'
import { sheetDiagnostics } from '@/lib/data'

export const dynamic = 'force-dynamic'

/**
 * Per-tab health check for the configured Sheet. One read per tab, so it is
 * only ever called on demand from the commissioner page — never on render.
 */
export async function GET() {
  if (!isCommish()) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    return NextResponse.json(await sheetDiagnostics())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sheet check failed'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
