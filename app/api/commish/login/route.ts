import { NextResponse } from 'next/server'
import { COMMISH_COOKIE, commishConfigured, sessionCookieValue, verifyPasscode } from '@/lib/commish/auth'

export async function POST(req: Request) {
  if (!commishConfigured()) {
    return NextResponse.json({ error: 'Commissioner passcode is not configured (set COMMISH_PASSCODE)' }, { status: 501 })
  }
  const body = await req.json().catch(() => ({}))
  if (typeof body.passcode !== 'string' || !verifyPasscode(body.passcode)) {
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COMMISH_COOKIE, sessionCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 150, // one season
    path: '/',
  })
  return res
}
