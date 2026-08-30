import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { rowsToTrades, snakeOverall, parseDraftCell, rowsToDraft } from '../lib/data/transform'
import { playoffClinchStatus } from '../lib/data/clinch'
import { SeasonData } from '../lib/types'

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}

// --- Snake draft numbering (verified against the 2025 Kenny/Chuy pick trade:
// slot 4's round-2 pick is #21, slot 6's is #19) ---
check('snake: round 1 is linear', snakeOverall(1, 4, 12) === 4)
check('snake: round 2 reverses (slot 4 -> 21)', snakeOverall(2, 4, 12) === 21)
check('snake: round 2 reverses (slot 6 -> 19)', snakeOverall(2, 6, 12) === 19)
check('snake: round 3 linear again (slot 1 -> 25)', snakeOverall(3, 1, 12) === 25)
check('snake: last pick', snakeOverall(20, 1, 12) === 240)

// --- Draft cell parsing across every historical format ---
const cells: [string, string, string | undefined, string | undefined][] = [
  ['Bijan Robinson ATL RB', 'Bijan Robinson', 'ATL', 'RB'],
  ['Kareem Hunt (RB, KC)', 'Kareem Hunt', 'KC', 'RB'],
  ['Emari Demercado ARI (RB)', 'Emari Demercado', 'ARI', 'RB'],
  ['Lamar Jackson (QB) HOU QB', 'Lamar Jackson', 'HOU', 'QB'],
  ['Denver Broncos DEN D/ST', 'Denver Broncos', 'DEN', 'DEF'],
  ['Kenneth Walker III SEA RB', 'Kenneth Walker III', 'SEA', 'RB'],
  ['C.J. Stroud', 'C.J. Stroud', undefined, undefined],
]
for (const [raw, player, nflTeam, position] of cells) {
  const p = parseDraftCell(raw)
  check(`cell: ${raw}`, p.player === player && p.nflTeam === nflTeam && p.position === position, p)
}

// --- Trades parsing: archived CSV (packed) round-trips ---
{
  const rows: any[] = parse(readFileSync('data/seasons/2024/trades.csv', 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  const trades = rowsToTrades(rows)
  check('trades: 15 in 2024', trades.length === 15, trades.length)
  check('trades: Zeus canonicalized to Chuy', trades[0].team1 === 'Chuy', trades[0])
  check('trades: multi-asset split', trades[0].team1Gets.length === 3, trades[0].team1Gets)
  // Live-tab shape: one asset per row, blank continuation team cells
  const live = rowsToTrades([
    { 'Team 1': 'Kenny', 'Team 1 Gets': 'Round 1, Pick 4', 'Team 2': 'Chuy', 'Team 2 Gets': 'Round 1, Pick 6' },
    { 'Team 1': '', 'Team 1 Gets': 'Round 4, Pick 45', 'Team 2': '', 'Team 2 Gets': 'Round 4, Pick 43' },
  ])
  check('trades: live continuation rows', live.length === 1 && live[0].team1Gets.length === 2, live)
}

// --- Draft numbering end-to-end on the real 2025 board ---
{
  const rows: any[] = parse(readFileSync('data/seasons/2025/draft.csv', 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  const picks = rowsToDraft(rows)
  check('draft: 240 picks ordered', picks.length === 240 && picks[0].overall === 1 && picks[239].overall === 240)
  check('draft: pick 1 = Paco/Bijan', picks[0].team === 'Paco' && picks[0].player === 'Bijan Robinson', picks[0])
  check('draft: pick 13 = Larry (snake)', picks[12].team === 'Larry', picks[12])
}

// --- Clinch/elimination bounds ---
{
  // 12 teams, fixed pairings, fixed pecking order: every week A..F beat and
  // outscore G..L, so after w complete weeks A-F have 2w wins, G-L zero.
  const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const pairs: [string, string][] = [['A', 'L'], ['B', 'K'], ['C', 'J'], ['D', 'I'], ['E', 'H'], ['F', 'G']]
  const weekRows = (week: number) =>
    pairs.flatMap(([hi, lo]) => {
      const hiScore = 120 - TEAMS.indexOf(hi) * 5
      const loScore = 120 - TEAMS.indexOf(lo) * 5
      return [
        { week, team: hi, score: hiScore, opponent: lo, result: 'Win' as const },
        { week, team: lo, score: loScore, opponent: hi, result: 'Loss' as const },
      ]
    })
  const season = (weeks: number, extraPartialRows = 0) =>
    ({
      standings: TEAMS.map((team) => ({ team })),
      teamWeeks: [
        ...Array.from({ length: weeks }, (_, i) => weekRows(i + 1)).flat(),
        // A partially entered week must count as still-to-play, not as results
        ...weekRows(weeks + 1).slice(0, extraPartialRows),
      ],
    }) as unknown as SeasonData

  // After 5 complete weeks (A-F on 10 wins, 9 weeks left) nothing is decided
  const early = playoffClinchStatus(season(5))
  check('clinch: everyone alive early', TEAMS.every((t) => early.get(t) === 'alive'), Object.fromEntries(early))

  // After 12 complete weeks: A-F on 24 with only 5 rivals able to catch them;
  // G-L max out at 4 with six teams already past that
  const late = playoffClinchStatus(season(12))
  check('clinch: top six clinched', late.get('A') === 'clinched' && late.get('F') === 'clinched', Object.fromEntries(late))
  check('clinch: bottom six eliminated', late.get('G') === 'eliminated' && late.get('L') === 'eliminated', late.get('G'))

  // A half-entered week 13 (2 of 12 rows) must not change any verdict
  const partial = playoffClinchStatus(season(12, 2))
  check(
    'clinch: partial week changes nothing',
    TEAMS.every((t) => partial.get(t) === late.get(t)),
    Object.fromEntries(partial),
  )
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
