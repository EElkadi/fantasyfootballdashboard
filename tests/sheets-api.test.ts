/**
 * The real Trades/Rosters write path (logTrade + syncTradesToRosters) against
 * an in-memory Google Sheets that enforces grid limits the way the live API
 * does — starting from a four-column Trades tab, which used to fail with
 * "exceeds grid limits". sheets.ts is server-only, so run with:
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx tests/sheets-api.test.ts
 */
process.env.LEAGUE_SHEET_ID = 'test-sheet'
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com'
process.env.GOOGLE_PRIVATE_KEY = 'unused'
import { JWT } from 'google-auth-library'

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}
;(JWT.prototype as any).getAccessToken = async () => ({ token: 'fake' })

type Tab = { id: number; rows: number; cols: number; cells: string[][] }
const tabs: Record<string, Tab> = {
  Trades: {
    id: 1, rows: 950, cols: 4,
    cells: [
      ['TEAM 1', 'TEAM 1 GETS', 'TEAM 2', 'TEAM 2 GETS'],
      // the earlier two-team trade: rosters already moved, stamp never landed
      ['Elaf', 'Daniel Jones', 'Larry', 'Bryce Young'],
    ],
  },
  Rosters: {
    id: 2, rows: 1000, cols: 12,
    cells: [
      ['Paco', 'Jay', 'Chuy', 'Elaf', 'Larry'],
      ['Bijan Robinson ATL RB', 'Josh Allen BUF QB', 'Jake Bates DET K', 'Daniel Jones IND QB', 'Bryce Young CAR QB'],
      ['Puka Nacua LAR WR', '', '', '', ''],
    ],
  },
}
const log: string[] = []
const pos = (a1: string) => {
  const m = a1.match(/^([A-Z]+)(\d+)$/)!
  return { row: +m[2], col: m[1].split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) }
}
const write = (tab: Tab, start: string, values: string[][]): string | null => {
  const p = pos(start)
  const lastRow = p.row + values.length - 1
  const lastCol = p.col + Math.max(...values.map((r) => r.length)) - 1
  if (lastRow > tab.rows || lastCol > tab.cols) {
    return `Range (${start}) exceeds grid limits. Max rows: ${tab.rows}, max columns: ${tab.cols}`
  }
  values.forEach((r, i) => r.forEach((v, j) => {
    const row = (tab.cells[p.row - 1 + i] ??= [])
    row[p.col - 1 + j] = String(v)
  }))
  return null
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const err400 = (msg: string) => json({ error: { code: 400, message: `Invalid data[0]: ${msg}` } }, 400)

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const u = new URL(url)
  const path = decodeURIComponent(u.pathname.split('/spreadsheets/')[1].replace(/^[^/:]+/, ''))
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : null
  if (method === 'GET' && path === '' ) {
    return json({ sheets: Object.entries(tabs).map(([title, t]) => ({ properties: { title, sheetId: t.id, gridProperties: { rowCount: t.rows, columnCount: t.cols } } })) })
  }
  if (method === 'GET' && path === '/values:batchGet') {
    const ranges = u.searchParams.getAll('ranges')
    return json({ valueRanges: ranges.map((r) => ({ range: r, values: tabs[r.split('!')[0]].cells.map((row) => Array.from(row, (c) => c ?? '')) })) })
  }
  if (method === 'POST' && path === '/values:batchUpdate') {
    for (const d of body.data) {
      const [t, cell] = d.range.split('!')
      const e = write(tabs[t], cell, d.values)
      if (e) { log.push(`REJECT ${e}`); return err400(e) }
    }
    log.push(`batchUpdate ${body.data.map((d: any) => d.range).join(' ')}`)
    return json({})
  }
  if (method === 'PUT' && path.startsWith('/values/')) {
    const [t, cell] = path.slice('/values/'.length).split('!')
    const e = write(tabs[t], cell, body.values)
    if (e) { log.push(`REJECT ${e}`); return err400(e) }
    log.push(`PUT ${t}!${cell} (${body.values.length} rows)`)
    return json({})
  }
  if (method === 'POST' && path === ':batchUpdate') {
    for (const r of body.requests) {
      const d = r.appendDimension
      const t = Object.values(tabs).find((x) => x.id === d.sheetId)!
      if (d.dimension === 'COLUMNS') t.cols += d.length
      else t.rows += d.length
      log.push(`GROW sheet ${d.sheetId} +${d.length} ${d.dimension}`)
    }
    return json({})
  }
  throw new Error(`unmocked ${method} ${path}`)
}) as typeof fetch

;(async () => {
  const { logTrade, syncTradesToRosters } = await import('../lib/data/tradeRosters')
  const { parseTradeAsset } = await import('../lib/data/transform')
  const row = await logTrade([
    { team: 'Paco', gets: [parseTradeAsset('Josh Allen')] },
    { team: 'Jay', gets: [parseTradeAsset('Jake Bates')] },
    { team: 'Chuy', gets: [parseTradeAsset('Bijan Robinson'), parseTradeAsset('Round 2, Pick 19')] },
  ])
  const sync = await syncTradesToRosters({ apply: true, only: (t) => t.row === row })
  const trades = tabs.Trades.cells.map((r) => Array.from(r, (c) => c ?? ''))
  const rosters = tabs.Rosters.cells.map((r) => Array.from(r, (c) => c ?? ''))

  check('grid: the narrow tab was refused, grown, and the write retried', log.some((l) => l.startsWith('REJECT')) && log.some((l) => l.startsWith('GROW')), log)
  check('grid: Trades tab now fits the 3-team columns and the stamp', tabs.Trades.cols >= 7, tabs.Trades.cols)
  check('header: TEAM 3 columns and the stamp added after the old ones', trades[0].slice(4, 7).join('|') === 'TEAM 3|TEAM 3 GETS|ON ROSTERS', trades[0])
  check('log: the deal lands right under the last one', row === 3 && trades[2][0] === 'Paco' && trades[2][4] === 'Chuy', trades[2])
  check('log: senders recorded for the ledger', trades[2][1] === 'Josh Allen (from Jay)' && trades[2][5] === 'Bijan Robinson (from Paco)', trades[2])
  check('log: a second asset continues on the next row', trades[3][5] === 'Round 2, Pick 19' && trades[3][0] === '', trades[3])
  check('sync: all three players moved', sync.outcomes.flatMap((o) => o.moved).length === 3, sync.outcomes)
  check('sync: rosters match the deal, with no holes', rosters[1].slice(0, 3).join('|') === 'Josh Allen BUF QB|Jake Bates DET K|Bijan Robinson ATL RB', rosters)
  check('stamp: the new deal is stamped', /^✓ /.test(trades[2][6] ?? ''), trades[2])
  check('stamp: the earlier deal whose players already moved is stamped too', /^✓ /.test(trades[1][6] ?? ''), trades[1])
  check('stamp: its rosters were left alone', rosters[1][3] === 'Daniel Jones IND QB' && rosters[1][4] === 'Bryce Young CAR QB', rosters)

  const again = await syncTradesToRosters({ apply: false })
  check('sync: nothing left pending afterwards', again.pending === 0 && again.outcomes.length === 0, again)

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
