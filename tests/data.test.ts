import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { rowsToTrades, snakeOverall, parseDraftCell, rowsToDraft, gridToSchedule } from '../lib/data/transform'
import { LEAGUE } from '../lib/league'
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

// --- 2026 schedule obeys the league's scheduling rules ---
{
  const rows: any[] = parse(readFileSync('data/seasons/2026/schedule.csv', 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  const weeks = gridToSchedule(rows)
  const teams = Object.keys(weeks[0].opponents).sort()

  // Every name must resolve to a known owner, or gridToSchedule leaves it raw
  check('schedule: 12 teams, 14 weeks', teams.length === 12 && weeks.length === LEAGUE.regularSeasonWeeks, [teams.length, weeks.length])
  check('schedule: week 7 labeled Rivalry Week', weeks.find((w) => w.week === 7)?.label === 'Rivalry Week')

  const pairsOf = (w: (typeof weeks)[number]) => {
    const seen = new Set<string>()
    const pairs: string[][] = []
    for (const [team, opp] of Object.entries(w.opponents)) {
      if (seen.has(team)) continue
      seen.add(team)
      seen.add(opp)
      pairs.push([team, opp].sort())
    }
    return pairs
  }

  // Symmetry: if A plays B, B plays A — and nobody plays themselves
  const symmetric = weeks.every((w) =>
    Object.entries(w.opponents).every(([t, o]) => t !== o && w.opponents[o] === t),
  )
  check('schedule: every week pairs off cleanly', symmetric)

  const key = (p: string[]) => p.join('|')
  const regular = weeks.filter((w) => w.week <= 11).flatMap(pairsOf).map(key)
  const all = weeks.flatMap(pairsOf).map(key)
  const everyPair = teams.flatMap((a, i) => teams.slice(i + 1).map((b) => key([a, b].sort())))

  // Rule 3 (everyone plays everyone before a repeat) implies weeks 1-11 are a
  // complete single round robin, which in turn gives rules 1 and 2.
  check('schedule: weeks 1-11 are a complete round robin', regular.length === 66 && new Set(regular).size === 66)
  check('schedule: every pairing happens at least once', everyPair.every((p) => all.includes(p)), everyPair.filter((p) => !all.includes(p)))
  const counts = everyPair.map((p) => all.filter((x) => x === p).length)
  check('schedule: no pairing happens more than twice', Math.max(...counts) === 2, Math.max(...counts))
  check('schedule: every team plays 14 games', teams.every((t) => all.filter((p) => p.split('|').includes(t)).length === 14))

  const rivalry = pairsOf(weeks.find((w) => w.week === 7)!).map(key).sort()
  const expected = [
    ['Monaf', 'Paco'], ['Chuy', 'Bala'], ['ATL', 'Greg'],
    ['Kenny', 'Jay'], ['Julio', 'Choy'], ['Elaf', 'Gaybo'],
  ]
    .map((p) => key(p.sort()))
    .sort()
  check('schedule: rivalry week matchups exact', JSON.stringify(rivalry) === JSON.stringify(expected), rivalry)
}

// --- Clinch/elimination bounds (7 playoff spots) ---
{
  // 12 teams, adjacent pairings, fixed pecking order (A outscores B outscores
  // C…): each week A,C,E,G,I,K win their matchups and A-F take the top-6
  // spots, so weekly wins are A:2 C:2 E:2, B/D/F/G/I/K:1, H/J/L:0.
  const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const pairs: [string, string][] = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J'], ['K', 'L']]
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

  // After 5 complete weeks (9 left, ceilings +18) nothing is decided
  const early = playoffClinchStatus(season(5))
  check('clinch: everyone alive early', TEAMS.every((t) => early.get(t) === 'alive'), Object.fromEntries(early))

  // After 12 complete weeks (2 left): A on 24 with only C and E able to
  // catch its floor -> clinched; B on 12 with 8 rivals able to reach 12 ->
  // alive; H maxes at 4 with 9 teams already past that -> eliminated
  const late = playoffClinchStatus(season(12))
  check('clinch: runaway leader clinched', late.get('A') === 'clinched', Object.fromEntries(late))
  check('clinch: bubble team alive', late.get('B') === 'alive', late.get('B'))
  check('clinch: doomed teams eliminated', late.get('H') === 'eliminated' && late.get('L') === 'eliminated', late.get('H'))

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
