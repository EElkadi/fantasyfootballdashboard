import 'server-only'
import { JWT } from 'google-auth-library'

/**
 * Thin Google Sheets client over the REST API using a service account.
 *
 * Env:
 *  - LEAGUE_SHEET_ID                 spreadsheet to read/write
 *  - GOOGLE_SERVICE_ACCOUNT_KEY     full service-account JSON (preferred), or
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (\n-escaped newlines ok)
 *  - SCORES_TAB (default "Scores"), SCHEDULE_TAB (defaults to trying
 *    "Team by Team Schedule" then "Schedule"),
 *    ROSTERS_TAB (default "Rosters")
 */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export const SHEET_ID = process.env.LEAGUE_SHEET_ID ?? ''
export const SCORES_TAB = process.env.SCORES_TAB ?? 'Scores'
/**
 * Where the week-by-week grid lives (Week + one column per team).
 *
 * This league's workbooks keep that grid on "Team by Team Schedule"; the tab
 * actually named "Schedule" is a free-form weekly scratch area the parser
 * can't read. Both are tried in order so either convention works. Setting
 * SCHEDULE_TAB pins one explicitly.
 */
export const SCHEDULE_TABS = process.env.SCHEDULE_TAB
  ? [process.env.SCHEDULE_TAB]
  : ['Team by Team Schedule', 'Schedule']
export const ROSTERS_TAB = process.env.ROSTERS_TAB ?? 'Rosters'
export const DRAFT_TAB = process.env.DRAFT_TAB ?? 'Final Draft Board'
export const WAIVERS_TAB = process.env.WAIVERS_TAB ?? 'Waiver Wire'
export const TEAMS_TAB = process.env.TEAMS_TAB ?? 'Teams'
export const ADJUSTMENTS_TAB = process.env.ADJUSTMENTS_TAB ?? 'Adjustments'
export const TRADES_TAB = process.env.TRADES_TAB ?? 'Trades'
export const PREDICTIONS_TAB = process.env.PREDICTIONS_TAB ?? 'Predictions'

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

/**
 * Append a row to the bottom of a tab's data. Commissioner-entered rows use
 * USER_ENTERED so numbers land as numbers; anything carrying free text from
 * the league at large must pass `raw: true`, or a cell starting with "="
 * becomes a live formula.
 */
export async function appendRow(tab: string, row: (string | number)[], opts: { raw?: boolean } = {}): Promise<void> {
  const mode = opts.raw ? 'RAW' : 'USER_ENTERED'
  await sheetsFetch(
    `/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=${mode}&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  )
}

/** 1-based column index -> letter(s): 1 -> A, 27 -> AA. */
export function columnLetter(index: number): string {
  let s = ''
  let n = index
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Write one cell (A1 notation), e.g. updateCell('Final Draft Board', 'C5', 'Bijan Robinson ATL RB'). */
export async function updateCell(tab: string, cell: string, value: string | number): Promise<void> {
  await sheetsFetch(`/values/${encodeURIComponent(`${tab}!${cell}`)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[value]] }),
  })
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
