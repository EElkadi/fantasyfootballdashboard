import 'server-only'
import { createHmac } from 'crypto'
import { cookies } from 'next/headers'

/**
 * Commissioner auth: one shared passcode (env COMMISH_PASSCODE) exchanged for
 * an httpOnly cookie. The cookie is an HMAC derived from the passcode, so
 * rotating the passcode invalidates existing sessions.
 */

export const COMMISH_COOKIE = 'plff_commish'

function passcode(): string {
  return process.env.COMMISH_PASSCODE ?? ''
}

function tokenFor(pass: string): string {
  return createHmac('sha256', 'plff-commish-v1').update(pass).digest('hex')
}

export function commishConfigured(): boolean {
  return passcode().length > 0
}

export function verifyPasscode(input: string): boolean {
  const expected = passcode()
  if (!expected) return false
  // Compare HMACs so length differences leak nothing
  return tokenFor(input) === tokenFor(expected)
}

export function sessionCookieValue(): string {
  return tokenFor(passcode())
}

export function isCommish(): boolean {
  if (!commishConfigured()) return false
  const value = cookies().get(COMMISH_COOKIE)?.value
  return Boolean(value && value === sessionCookieValue())
}

/**
 * League-wide passcode (env LEAGUE_PASSCODE) — shared with all twelve
 * managers so they can submit things like preseason predictions under their
 * own name. Deliberately separate from the commissioner passcode.
 */
export function leaguePasscodeConfigured(): boolean {
  return (process.env.LEAGUE_PASSCODE ?? '').length > 0
}

export function verifyLeaguePasscode(input: string): boolean {
  const expected = process.env.LEAGUE_PASSCODE ?? ''
  if (!expected) return false
  return tokenFor(input) === tokenFor(expected)
}
