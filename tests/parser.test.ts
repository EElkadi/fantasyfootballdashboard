import { parseSubmission } from '../lib/parser/parse'

// Real submissions from the league WhatsApp (typos and all)
const SAMPLE_1 = `Week 11
Chuy vs Larry
QB. Jordan Love: 18pts
RB. Josh Jacobs: 4pts
RB. James Cook: 18pts
WR. Davante Adams: 6pts
WR. Wan’Dale Robinson: 3pts
DEF. Green Bay: 10pts
K. Evan McPherson: 6pts
FLEX. D’Andre Swift: 9pts
FLEX. TreVeyon Henderson: 27pts
Total: 101pts

QB. Bo Nix: 11pts
RB. Javonte Williams: 9pts
RB. Breece Hall: 5pts
WR. Brian Thomas Jr: 0pts
WR. Khalil Shakir: 0pts
DEF. Cleveland: 27pts
K. Will Reichard: 5pts
FLEX. Rachaad White: 6pts
FLEX. Kyle Monangai: 9pts
Total: 66pts`

const SAMPLE_2 = `QB. Mathew Stafford - 31
RB. Saquon Barkley - 7
RB. Kenneth Walker III- 10
WR. Romeo -2 
WR. DJ Moore-20
K. Jake Bates-13
DEF. Baltimore -15
FLEX. Alvin Kamara -1 
FLEX. Cooper Kupp-2
101`

const SAMPLE_3 = `QB: Shadeur Sanders-18
RB: David Montgomery - 2 
RB: Breece Hall - 11
WR: Rashid Shaheed-0
WR: Jerry Jeudy- 3
K: Will Reichard- 12
DEF: Cleveland-26
Flex: Khalil Shakir-11
Flex: Kyle -10
83`

const ROSTERS = {
  Doy: ['Matthew Stafford LAR QB', 'Saquon Barkley PHI RB', 'Kenneth Walker III SEA RB', 'Romeo Doubs GBP WR', 'DJ Moore CHI WR', 'Jake Bates DET K', 'Baltimore Ravens BAL D/ST', 'Alvin Kamara NOS RB', 'Cooper Kupp SEA WR'],
  Larry: ['Bo Nix DEN QB', 'Javonte Williams DAL RB', 'Breece Hall NYJ RB', 'Brian Thomas Jr. JAC WR', 'Khalil Shakir BUF WR', 'Cleveland Browns CLE D/ST', 'Will Reichard MIN K', 'Rachaad White TBB RB', 'Kyle Monangai CHI RB'],
  Chuy: ['Jordan Love GBP QB', 'Josh Jacobs GBP RB', 'James Cook BUF RB', 'Davante Adams LAR WR', "Wan'Dale Robinson NYG WR", 'Green Bay Packers GBP D/ST', 'Evan McPherson CIN K', "D'Andre Swift CHI RB", 'TreVeyon Henderson NEP RB'],
}

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) { failures++; console.log(`FAIL ${label}`, detail ?? '') }
  else console.log(`ok   ${label}`)
}

// --- Sample 1: clean format with headers ---
{
  const r = parseSubmission(SAMPLE_1, { rosters: ROSTERS })
  check('s1: week 11', r.week === 11)
  check('s1: two lineups', r.lineups.length === 2, r.lineups.length)
  check('s1: teams from header', r.lineups[0]?.team === 'Chuy' && r.lineups[1]?.team === 'Larry', r.lineups.map(l => l.team))
  check('s1: lineup 1 total reconciles', r.lineups[0]?.computedTotal === 101 && r.lineups[0]?.issues.length === 0, [r.lineups[0]?.computedTotal, r.lineups[0]?.issues])
  // The sample's second lineup really does sum to 72, not the stated 66 —
  // the parser must flag it, not trust it.
  check('s1: lineup 2 mismatch flagged (72 vs 66)', r.lineups[1]?.computedTotal === 72 && (r.lineups[1]?.issues.some(i => i.includes('≠')) ?? false), [r.lineups[1]?.computedTotal, r.lineups[1]?.issues])
  check('s1: 9 slots each', r.lineups.every(l => l.players.length === 9))
  check('s1: Wan\'Dale matched', r.lineups[0]?.players.find(p => p.slot === 'WR2')?.name === "Wan'Dale Robinson")
}

// --- Sample 2: dash separators, partial "Romeo", suffix "III", no headers ---
{
  const r = parseSubmission(SAMPLE_2, { rosters: ROSTERS, week: 11 })
  check('s2: one lineup', r.lineups.length === 1, r.lineups.length)
  const l = r.lineups[0]
  check('s2: team inferred as Doy', l?.team === 'Doy', l?.team)
  check('s2: total 101 reconciles', l?.computedTotal === 101 && l?.statedTotal === 101, [l?.computedTotal, l?.statedTotal])
  check('s2: typo Mathew -> Matthew Stafford', l?.players[0]?.name === 'Matthew Stafford', l?.players[0])
  check('s2: Romeo -> Romeo Doubs', l?.players.find(p => p.slot === 'WR1')?.name === 'Romeo Doubs', l?.players.find(p => p.slot === 'WR1'))
  check('s2: Kenneth Walker III score 10', l?.players.find(p => p.slot === 'RB2')?.score === 10)
  check('s2: no total mismatch issue', !l?.issues.some(i => i.includes('≠')), l?.issues)
}

// --- Sample 3: colon format, typos, bare total that does NOT reconcile ---
{
  const r = parseSubmission(SAMPLE_3, { rosters: ROSTERS, week: 11 })
  check('s3: one lineup', r.lineups.length === 1, r.lineups.length)
  const l = r.lineups[0]
  check('s3: team inferred as Larry', l?.team === 'Larry', l?.team)
  check('s3: mismatch flagged (93 vs 83)', l?.issues.some(i => i.includes('≠')) ?? false, l?.issues)
  check('s3: Kyle -> Kyle Monangai', l?.players.find(p => p.slot === 'Flex2')?.name === 'Kyle Monangai', l?.players.find(p => p.slot === 'Flex2'))
  check('s3: Shadeur typo matched', l?.players[0]?.name?.includes('Sanders') ?? false, l?.players[0])
}

// --- Two lineups back to back, no total lines, repeated QB starts new lineup ---
{
  const r = parseSubmission(`Week 3\nQB. A: 10\nRB. B: 5\nQB. C: 20\nRB. D: 1`, {})
  check('s4: repeated QB splits lineups', r.lineups.length === 2, r.lineups.length)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
