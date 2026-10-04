import { scoreRowFor } from '../lib/data/scoreRows'
import { columnDiff, headerAdditions, inferSenders, isPickAsset, nextTradeRow, planTrades, tradeRows, tradesFromGrid } from '../lib/data/tradeSync'
import { parseTradeAsset, rowsToTrades, wideRowToMatchup } from '../lib/data/transform'

/** Header-keyed rows, as lib/data/sheets toObjects builds them (that module is server-only). */
const toObjects = (rows: string[][]) =>
  rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h, r[i] ?? ''])))

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}

// --- Scores: which row a matchup lands in ---
{
  const header = ['Week', 'Team 1', ...Array(19).fill('x'), 'Team 2']
  const row = (week: number | '', t1: string, t2: string) => {
    const r: string[] = Array(22).fill('')
    r[0] = String(week)
    r[1] = t1
    r[21] = t2
    return r
  }
  const week1 = [row(1, 'Paco', 'Kenny'), row(1, 'ATL', 'Monaf'), row(1, 'Elaf', 'Chuy')]

  check('scores: first save on an empty tab goes to row 2', scoreRowFor([header], 1, 'Paco', 'Kenny').row === 2)
  check('scores: next save goes right under the data', scoreRowFor([header, ...week1], 1, 'Jay', 'Larry').row === 5)

  // The bug: something far down the tab (here, row 86) must not pull the write there
  const junkBelow: string[][] = [header, ...week1, ...Array(81).fill([]), ['', '', 'stray note']]
  check('scores: stray cells lower down do not move the target', scoreRowFor(junkBelow, 1, 'Jay', 'Larry').row === 5, scoreRowFor(junkBelow, 1, 'Jay', 'Larry'))

  // A tab laid out in advance with week numbers down column A
  const weeks = [header, ...week1, row(1, '', ''), row(1, '', ''), row(1, '', ''), row(2, '', ''), row(2, '', '')]
  check('scores: pre-numbered tab fills the first open slot for that week', scoreRowFor(weeks, 1, 'Jay', 'Larry').row === 5)
  check('scores: pre-numbered tab puts week 2 on the week-2 rows', scoreRowFor(weeks, 2, 'Jay', 'Larry').row === 8)

  // Re-saving corrects in place, either team order
  const again = scoreRowFor([header, ...week1], 1, 'Monaf', 'ATL')
  check('scores: re-saving a matchup replaces its row', again.row === 3 && again.replacing, again)
  check('scores: same teams in another week is a new row', scoreRowFor([header, ...week1], 2, 'Paco', 'Kenny').row === 5)

  // A blank gap mid-table gets reused
  check('scores: a cleared row in the middle is reused', scoreRowFor([header, week1[0], row('', '', ''), week1[2]], 1, 'Jay', 'Larry').row === 3)

  // Placeholder rows (week + teams typed, nothing scored) aren't 0–0 games
  const placeholder = wideRowToMatchup({ Week: '5', 'Team 1': 'Paco', 'Team 2': 'Kenny' })
  check('scores: an unscored placeholder row is not read as a game', placeholder === null, placeholder)
}

// --- Trades -> Rosters ---
{
  check('trades: pick swaps are recognised', ['Round 2, Pick 19', "Monaf's 1st", '2027 R1', 'Rd 3 pick', '3rd round pick'].every(isPickAsset))
  check('trades: players are not picks', !['Josh Allen', 'Amon-Ra St. Brown', 'Jordan Mason SFO (RB)', 'Kenneth Walker III'].some(isPickAsset))

  const grid = [
    ['TEAM 1', 'TEAM 1 GETS', 'TEAM 2', 'TEAM 2 GETS'],
    ['Paco', 'Josh Allen', 'Jay', 'Puka Nacua LAR WR'],
    ['', '', '', 'Round 3, Pick 30'],
    [],
    ['Chuy', 'Tyler Loop', 'Doy', 'Jake Bates'],
  ]
  const { trades, layout } = tradesFromGrid(grid)
  check('trades: two trades read with their first rows', trades.length === 2 && trades[0].row === 2 && trades[1].row === 5, trades)
  check('trades: continuation rows join the trade above', trades[0].parties[1].gets.map((g) => g.asset).join('|') === 'Puka Nacua LAR WR|Round 3, Pick 30')
  check('trades: two-team senders are implied', trades[0].parties[0].gets[0].from === 'Jay' && trades[0].parties[1].gets[0].from === 'Paco')
  const stampHeader = headerAdditions(layout, { stamp: true })
  check('trades: stamp column goes after the trade columns', stampHeader.layout.stamp === 4 && stampHeader.cells[0].value === 'ON ROSTERS', stampHeader)

  const columns = {
    Paco: ['Puka Nacua LAR WR', 'Bijan Robinson ATL RB', ''],
    Jay: ['Josh Allen BUF QB', 'Chase Brown CIN RB'],
    Chuy: ['Jake Bates DET K'],
    Doy: ['Tyler Loop BAL K'],
  }
  const plan = planTrades(trades, columns)
  const first = plan.outcomes[0]
  check('trades: a name without team or position still moves', first.moved.includes('Josh Allen: Jay → Paco') && first.moved.includes('Puka Nacua: Paco → Jay'), first)
  check('trades: the pick swap has no roster effect', first.resolved && first.missing.length === 0, first)
  check('trades: the incoming player takes the outgoing one\'s slot', plan.columns.Paco[0] === 'Josh Allen BUF QB' && plan.columns.Jay[0] === 'Puka Nacua LAR WR', plan.columns)
  check('trades: inputs are left untouched', columns.Jay[0] === 'Josh Allen BUF QB')
  check('trades: the kicker swap happens too', plan.columns.Chuy.includes('Tyler Loop BAL K') && plan.columns.Doy.includes('Jake Bates DET K'))

  const replay = planTrades(trades, plan.columns)
  check('trades: replay is a no-op', columnDiff(plan.columns, replay.columns).length === 0 && replay.outcomes.every((o) => o.moved.length === 0 && o.resolved), replay.outcomes)

  // Stamped trades are never replayed — e.g. the player was re-acquired later on waivers
  const stamped = tradesFromGrid(grid.map((r, i) => (i === 0 ? [...r, 'On Rosters'] : i === 1 ? [...r, '✓ Sep 20'] : r)))
  check('trades: existing stamp header is found', stamped.layout.stamp === 4 && headerAdditions(stamped.layout, { stamp: true }).cells.length === 0)
  const reacquired = planTrades(stamped.trades, { ...columns })
  check('trades: a stamped trade is skipped', reacquired.outcomes.every((o) => o.trade.row !== 2) && reacquired.columns.Jay.includes('Josh Allen BUF QB'))

  const typo = planTrades(tradesFromGrid([grid[0], ['Paco', 'Josh Alen', 'Jay', 'Puka Nacua']]).trades, columns)
  check('trades: a name on no roster is reported, not guessed', typo.outcomes[0].missing.includes('Josh Alen') && !typo.outcomes[0].resolved, typo.outcomes[0])
  check('trades: the rest of that trade still moves', typo.outcomes[0].moved.includes('Puka Nacua: Paco → Jay'))

  const codes = planTrades(tradesFromGrid([grid[0], ['Paco', 'Jordan Mason SF (RB)', 'Jay', 'Round 1, Pick 3']]).trades, {
    Paco: [],
    Jay: ['Jordan Mason SFO RB'],
  })
  check('trades: a different NFL team code still finds the player', codes.outcomes[0].moved.includes('Jordan Mason: Jay → Paco'), codes.outcomes[0])

  const diff = columnDiff(columns, plan.columns)
  check('trades: diff lists only changed cells', diff.length === 4 && diff.every((d) => (columns as Record<string, string[]>)[d.team][d.index] !== d.value), diff)
}

// --- Three-team trades ---
{
  check('3-team: "(from X)" is read off an asset', JSON.stringify(parseTradeAsset('Josh Allen (from Jay)')) === JSON.stringify({ asset: 'Josh Allen', from: 'Jay' }))
  check('3-team: "from" that is not a team stays part of the asset', parseTradeAsset('Pick from the 2027 draft').from === undefined)

  // Paco gets Allen (from Jay); Jay gets Bates (from Chuy); Chuy gets Bijan (from Paco) + a pick
  const rosters = {
    Paco: ['Bijan Robinson ATL RB', 'Puka Nacua LAR WR'],
    Jay: ['Josh Allen BUF QB'],
    Chuy: ['Jake Bates DET K'],
  }
  const parties = [
    { team: 'Paco', gets: [parseTradeAsset('Josh Allen')] },
    { team: 'Jay', gets: [parseTradeAsset('Jake Bates')] },
    { team: 'Chuy', gets: [parseTradeAsset('Bijan Robinson'), parseTradeAsset('Round 2, Pick 19')] },
  ]
  const senders = inferSenders(parties, rosters)
  check('3-team: senders read off the rosters', senders[0].gets[0].from === 'Jay' && senders[1].gets[0].from === 'Chuy' && senders[2].gets[0].from === 'Paco', senders)
  check('3-team: picks keep no inferred sender', senders[2].gets[1].from === undefined)

  // Written to a tab that only has the two-team columns: TEAM 3 columns get added
  const old = [['TEAM 1', 'TEAM 1 GETS', 'TEAM 2', 'TEAM 2 GETS'], ['Elaf', 'Daniel Jones', 'Jay', 'Bryce Young']]
  const added = headerAdditions(tradesFromGrid(old).layout, { parties: 3 })
  check('3-team: header gains TEAM 3 columns in the tab\'s style', added.cells.map((c) => `${c.column}:${c.value}`).join() === '4:TEAM 3,5:TEAM 3 GETS', added.cells)
  const rows = tradeRows(senders, added.layout)
  check('3-team: rows carry each sender for the ledger', rows[0][1] === 'Josh Allen (from Jay)' && rows[0][4] === 'Chuy' && rows[0][5] === 'Bijan Robinson (from Paco)', rows)
  check('3-team: a party\'s second asset continues on the next row', rows.length === 2 && rows[1][5] === 'Round 2, Pick 19' && rows[1][0] === '', rows)
  check('3-team: it lands below the last deal', nextTradeRow(old, added.layout) === 3)

  // Read back as the sheet would hold it, alongside the old two-team deal
  const sheet = [[...old[0], 'TEAM 3', 'TEAM 3 GETS'], old[1], ...rows.map((r, i) => (i === 0 ? r : r))]
  const back = tradesFromGrid(sheet).trades
  check('3-team: two- and three-team deals read side by side', back.length === 2 && back[0].parties.length === 2 && back[1].parties.length === 3, back)
  check('3-team: senders survive the round trip', back[1].parties[0].gets[0].from === 'Jay' && back[1].parties[2].gets.length === 2, back[1])
  check('3-team: ledger reader agrees', rowsToTrades(toObjects(sheet))[1].parties.length === 3)

  const plan = planTrades(back.slice(1), rosters)
  const o = plan.outcomes[0]
  check('3-team: every player moves to the right team', o.resolved && o.moved.length === 3 && plan.columns.Paco.includes('Josh Allen BUF QB') && plan.columns.Jay.includes('Jake Bates DET K') && plan.columns.Chuy.includes('Bijan Robinson ATL RB'), o)
  check('3-team: rosters stay compact', plan.columns.Paco[0] === 'Josh Allen BUF QB' && plan.columns.Paco.length === 2, plan.columns.Paco)
  check('3-team: nobody keeps what they sent', !plan.columns.Paco.includes('Bijan Robinson ATL RB') && !plan.columns.Jay.includes('Josh Allen BUF QB') && !plan.columns.Chuy.includes('Jake Bates DET K'))

  // Typed straight into the sheet with no senders: still works, found by roster
  const bare = tradesFromGrid([sheet[0], ['Paco', 'Josh Allen', 'Jay', 'Jake Bates', 'Chuy', 'Bijan Robinson']]).trades
  const barePlan = planTrades(bare, rosters)
  check('3-team: senders are optional in the sheet', barePlan.outcomes[0].moved.join() === 'Josh Allen: Jay → Paco,Jake Bates: Chuy → Jay,Bijan Robinson: Paco → Chuy', barePlan.outcomes[0].moved)
  check('3-team: replay is a no-op', planTrades(bare, barePlan.columns).outcomes[0].moved.length === 0)

  // A wrong recorded sender doesn't strand the player
  const wrongFrom = tradesFromGrid([sheet[0], ['Paco', 'Josh Allen (from Chuy)', 'Jay', 'Jake Bates', 'Chuy', 'Bijan Robinson']]).trades
  check('3-team: a mistaken sender is corrected by the rosters', planTrades(wrongFrom, rosters).outcomes[0].moved.includes('Josh Allen: Jay → Paco'))
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
