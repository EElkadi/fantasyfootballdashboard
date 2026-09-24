import { scoreRowFor } from '../lib/data/scoreRows'
import { columnDiff, isPickAsset, planTrades, tradesFromGrid } from '../lib/data/tradeSync'
import { wideRowToMatchup } from '../lib/data/transform'

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
  const { trades, stampCol, hasStampHeader } = tradesFromGrid(grid)
  check('trades: two trades read with their first rows', trades.length === 2 && trades[0].row === 2 && trades[1].row === 5, trades)
  check('trades: continuation rows join the trade above', trades[0].team2Gets.join('|') === 'Puka Nacua LAR WR|Round 3, Pick 30')
  check('trades: stamp column goes after the four trade columns', stampCol === 4 && !hasStampHeader)

  const columns = {
    Paco: ['Puka Nacua LAR WR', 'Bijan Robinson ATL RB', ''],
    Jay: ['Josh Allen BUF QB', 'Chase Brown CIN RB'],
    Chuy: ['Jake Bates DET K'],
    Doy: ['Tyler Loop BAL K'],
  }
  const plan = planTrades(trades, columns)
  const first = plan.outcomes[0]
  check('trades: a name without team or position still moves', first.moved.includes('Josh Allen → Paco') && first.moved.includes('Puka Nacua → Jay'), first)
  check('trades: the pick swap has no roster effect', first.resolved && first.missing.length === 0, first)
  check('trades: the moved player keeps his full roster cell', plan.columns.Paco.includes('Josh Allen BUF QB'))
  check('trades: the incoming player fills a gap', plan.columns.Paco[2] === 'Josh Allen BUF QB' && plan.columns.Paco[0] === '', plan.columns.Paco)
  check('trades: inputs are left untouched', columns.Jay[0] === 'Josh Allen BUF QB')
  check('trades: the kicker swap happens too', plan.columns.Chuy.includes('Tyler Loop BAL K') && plan.columns.Doy.includes('Jake Bates DET K'))

  // Replaying against the result changes nothing: safe to run twice
  const replay = planTrades(trades, plan.columns)
  check('trades: replay is a no-op', columnDiff(plan.columns, replay.columns).length === 0 && replay.outcomes.every((o) => o.moved.length === 0 && o.resolved), replay.outcomes)

  // Stamped trades are never replayed — the player was re-acquired later on waivers
  const stamped = tradesFromGrid(grid.map((r, i) => (i === 0 ? [...r, 'On Rosters'] : i === 1 ? [...r, '✓ Sep 20'] : r)))
  check('trades: existing stamp header is found', stamped.hasStampHeader && stamped.stampCol === 4)
  const reacquired = planTrades(stamped.trades, { ...columns })
  check('trades: a stamped trade is skipped', reacquired.outcomes.every((o) => o.trade.row !== 2) && reacquired.columns.Jay.includes('Josh Allen BUF QB'))

  // A typo'd name is reported, and the trade stays unstamped for another try
  const typo = planTrades(tradesFromGrid([grid[0], ['Paco', 'Josh Alen', 'Jay', 'Puka Nacua']]).trades, columns)
  check('trades: a name on neither roster is reported, not guessed', typo.outcomes[0].missing.includes('Josh Alen') && !typo.outcomes[0].resolved, typo.outcomes[0])
  check('trades: the rest of that trade still moves', typo.outcomes[0].moved.includes('Puka Nacua → Jay'))

  const codes = planTrades(tradesFromGrid([grid[0], ['Paco', 'Jordan Mason SF (RB)', 'Jay', 'Round 1, Pick 3']]).trades, {
    Paco: [],
    Jay: ['Jordan Mason SFO RB'],
  })
  check('trades: a different NFL team code still finds the player', codes.outcomes[0].moved.includes('Jordan Mason → Paco'), codes.outcomes[0])

  const diff = columnDiff(columns, plan.columns)
  check('trades: diff lists only changed cells', diff.length === 6 && diff.every((d) => (columns as Record<string, string[]>)[d.team][d.index] !== d.value), diff)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
