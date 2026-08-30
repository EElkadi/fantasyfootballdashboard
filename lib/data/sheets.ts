import 'server-only'
import { JWT } from 'google-auth-library'

/**
 * Thin Google Sheets client over the REST API using a service account.
 *
 * Env:
 *  - LEAGUE_SHEET_ID                 spreadsheet to read/write
 *  - GOOGLE_SERVICE_ACCOUNT_KEY     full service-account JSON (preferred), or
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (\n-escaped newlines ok)
 *  - SCORES_TAB (default "Scores"), SCHEDULE_TAB (default "Schedule"),
 *    ROSTERS_TAB (default "Rosters")
 */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export const SHEET_ID = process.env.LEAGUE_SHEET_ID ?? ''
export const SCORES_TAB = process.env.SCORES_TAB ?? 'Scores'
export const SCHEDULE_TAB = process.env.SCHEDULE_TAB ?? 'Schedule'
export const ROSTERS_TAB = process.env.ROSTERS_TAB ?? 'Rosters'

function credentials(): { email: string; key: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (parsed.client_email && parsed.private_key) {
        return { email: parsed.client_email, key: parsed.private_key }
      }
    } catch {
      // fall through to split vars
    }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (email && key) return { email, key }
  return null
}

export function hasLiveSheet(): boolean {
  return Boolean(SHEET_ID && credentials())
}

let jwt: JWT | null = null
async function accessToken(): Promise<string> {
  const creds = credentials()
  if (!creds) throw new Error('Google service account credentials are not configured')
  if (!jwt) {
    jwt = new JWT({
      email: creds.email,
      key: creds.key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('Failed to obtain Google access token')
  return token
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await accessToken()
  const res = await fetch(`${SHEETS_BASE}/${SHEET_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 500)}`)
  }
  return res.json()
}

/** Read a tab; returns rows of cells (strings). */
export async function readTab(tab: string, range = 'A1:AZ2000'): Promise<string[][]> {
  const data = await sheetsFetch(`/values/${encodeURIComponent(`${tab}!${range}`)}`)
  return (data.values ?? []) as string[][]
}

/** Append a row to the bottom of a tab's data. */
export async function appendRow(tab: string, row: (string | number)[]): Promise<void> {
  await sheetsFetch(
    `/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  )
}

/** Rows keyed by header row. Blank header cells and blank rows are dropped. */
export function toObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return []
  const header = rows[0]
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c && c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      header.forEach((h, i) => {
        if (h && h.trim()) obj[h.trim()] = (r[i] ?? '').trim()
      })
      return obj
    })
}
