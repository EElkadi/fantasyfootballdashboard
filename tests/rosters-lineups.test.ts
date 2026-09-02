import { rowsToLineups, rowsToTeamNames, canonSlot, parseDraftCell } from '../lib/data/transform'
import { parseSubmission } from '../lib/parser/parse'
import { buildRosterView, describeAcquisition } from '../lib/data/rosterView'
import { teamNameOf } from '../lib/league'
import { SeasonData } from '../lib/types'

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}

// --- Lineups tab: per-slot latest wins, partials merge ---
{
  const rows = [
    { Week: '3', Team: 'Eloy', Slot: 'Flex', Player: 'Josh Jacobs', Submitted: '2026-09-24T18:00:00Z' }, // Thursday
    { Week: '3', Team: 'Elaf', Slot: 'QB', Player: 'Josh Allen', Submitted: '2026-09-27T14:00:00Z' }, // Sunday full
    { Week: '3', Team: 'Elaf', Slot: 'RB1', Player: 'Bijan Robinson', Submitted: '2026-09-27T14:00:00Z' },
    { Week: '3', Team: 'Elaf', Slot: 'QB', Player: 'Jordan Love', Submitted: '2026-09-27T15:30:00Z' }, // swap
    { Week: '3', Team: 'Chuy', Slot: 'flex 2', Player: 'Romeo Doubs', Submitted: '2026-09-27T14:00:00Z' },
    { Week: '', Team: 'Chuy', Slot: 'QB', Player: 'Nobody', Submitted: '' },
    { Week: '3', Team: 'Chuy', Slot: 'TE', Player: 'Bad slot', Submitted: '' },
  ]
  const lineups = rowsToLineups(rows)
  const elaf = lineups.filter((l) => l.team === 'Elaf')
  check('lineups: Thursday partial survives the Sunday submission', elaf.some((l) => l.slot === 'Flex' && l.player === 'Josh Jacobs'), elaf)
  check('lineups: latest row wins per slot', elaf.find((l) => l.slot === 'QB')?.player === 'Jordan Love', elaf)
  check('lineups: Elaf has 3 slots set', elaf.length === 3, elaf.length)
  check('lineups: slot spellings canonicalized', lineups.some((l) => l.team === 'Chuy' && l.slot === 'Flex2'), lineups.filter((l) => l.team === 'Chuy'))
  check('lineups: bad rows dropped', lineups.length === 4, lineups.length)
  check('canonSlot: variants', canonSlot('DEF') === 'DEF' && canonSlot('d/st') === 'DEF' && canonSlot('rb 1') === 'RB1' && canonSlot('TE') === null)
}

// --- Team names from the Teams tab ---
{
  const names = rowsToTeamNames([
    { 'DRAFT ORDER': '1', TEAMS: 'Zeus', 'Team Name': 'Latino Velvet Reloaded' },
    { 'DRAFT ORDER': '2', TEAMS: 'Elaf', 'Team Name': '' },
    { 'DRAFT ORDER': '3', TEAMS: 'Somebody', 'Team Name': 'Ghost' },
  ])
  check('team names: alias resolves, blank and unknown skipped', JSON.stringify(names) === JSON.stringify({ Chuy: 'Latino Velvet Reloaded' }), names)
  check('teamNameOf: sheet name beats default', teamNameOf('Chuy', names) === 'Latino Velvet Reloaded')
  check('teamNameOf: falls back to OWNERS', teamNameOf('Elaf', names) === 'El Facho' && teamNameOf('Chuy') === 'Latino Velvet')
}

// --- Parser lineup mode ---
{
  const rosters = { Elaf: ['Josh Allen BUF (QB)', 'Josh Jacobs GB (RB)', 'Romeo Doubs GB (WR)'], Chuy: ['Jordan Love GB (QB)'] }
  const partial = parseSubmission('Week 3\nElaf\nFlex: Josh Jacobs', { rosters, lineupOnly: true })
  check('lineup mode: single-slot partial parses', partial.lineups.length === 1 && partial.lineups[0].team === 'Elaf' && partial.lineups[0].players[0].slot === 'Flex', partial)
  check('lineup mode: no missing-slot complaint', partial.lineups[0].issues.length === 0, partial.lineups[0].issues)
  check('lineup mode: roster match applied', partial.lineups[0].players[0].name === 'Josh Jacobs' && partial.lineups[0].players[0].confidence > 0)

  const full = parseSubmission('Elaf\nQB. Josh Allen\nRB: Josh Jacobs\nWR - Romeo\nFlex Jacobs 12', { rosters, week: 3, lineupOnly: true })
  const names = full.lineups[0].players.map((p) => `${p.slot}=${p.name}`)
  check('lineup mode: separators and typos handled', names.join(',') === 'QB=Josh Allen,RB1=Josh Jacobs,WR1=Romeo Doubs,Flex=Josh Jacobs', names)
  check('lineup mode: trailing number ignored, no score issues', full.lineups[0].players.every((p) => p.score === 0) && !full.lineups[0].issues.some((i) => /total/i.test(i)))

  // Explicit slot numbers pin the slot — a lone second back is RB2, not RB1
  const pinned = parseSubmission('Elaf\nRB2: Bijan Robinson\nFlex 2: Romeo Doubs', { rosters, lineupOnly: true })
  check('lineup mode: explicit RB2 / Flex 2 honored', pinned.lineups[0].players.map((p) => p.slot).join(',') === 'RB2,Flex2', pinned.lineups[0].players)
  const swapped = parseSubmission('Elaf\nWR2: Romeo\nWR1: Puka Nacua', { rosters, lineupOnly: true })
  check('lineup mode: out-of-order explicit slots keep their numbers', swapped.lineups[0].players.map((p) => `${p.slot}=${p.name}`).join(',') === 'WR2=Romeo Doubs,WR1=Puka Nacua', swapped.lineups[0].players)

  // Two managers' partials after a "vs" header split on the blank line between messages
  const two = parseSubmission('Elaf vs Chuy\nFlex: Josh Jacobs\n\nQB: Jordan Love', { rosters, lineupOnly: true })
  check('lineup mode: blank line separates two partials', two.lineups.length === 2 && two.lineups[0].team === 'Elaf' && two.lineups[1].team === 'Chuy' && two.lineups[1].players[0].slot === 'QB', two.lineups.map((l) => [l.team, l.players.map((p) => p.slot)]))
  const merged = parseSubmission('Elaf vs Chuy\nFlex: Josh Jacobs', { rosters, lineupOnly: true })
  check('lineup mode: a named team with no lines is flagged', merged.issues.some((i) => i.startsWith('Chuy named but no players')), merged.issues)

  // WhatsApp export prefixes: "[7:10 PM, 9/18/2026] Elaf: Flex Josh Jacobs"
  const exported = parseSubmission('[7:10 PM, 9/18/2026] Elaf: Flex Josh Jacobs\n[7:12 PM, 9/18/2026] Chuy: QB Jordan Love', { rosters, lineupOnly: true })
  check('lineup mode: sender prefix names the team', exported.lineups.length === 2 && exported.lineups[0].team === 'Elaf' && exported.lineups[1].team === 'Chuy', exported.lineups.map((l) => [l.team, l.players.map((p) => p.name)]))
  const bare = parseSubmission('Gaybo\nWR Puka Nacua 24', { lineupOnly: true })
  check('lineup mode: bare trailing number dropped without a roster', bare.lineups[0].players[0].name === 'Puka Nacua', bare.lineups[0].players[0])

  // Score mode unchanged
  const scored = parseSubmission('Elaf\nQB. Josh Allen: 30pts', { rosters })
  check('score mode: still flags missing slots', scored.lineups[0].issues.some((i) => i.startsWith('Missing slots')))
  const explicitScored = parseSubmission('Elaf\nRB2. Bijan Robinson: 20\nRB1. Josh Jacobs: 10\nTotal: 30', { rosters })
  check('score mode: explicit RB1/RB2 honored too', explicitScored.lineups[0].players.map((p) => `${p.slot}=${p.score}`).join(',') === 'RB2=20,RB1=10', explicitScored.lineups[0].players)
}

// --- Roster view: acquisition tags ---
{
  const season = {
    teams: ['Elaf', 'Chuy'],
    draft: [
      { round: 1, slot: 1, overall: 1, team: 'Elaf', player: 'Bijan Robinson', position: 'RB' },
      { round: 2, slot: 1, overall: 24, team: 'Elaf', player: 'Josh Allen', position: 'QB' },
      { round: 3, slot: 2, overall: 26, team: 'Chuy', player: 'Romeo Doubs', position: 'WR' },
    ],
    waivers: [{ week: 2, team: 'Elaf', player: 'Kareem Hunt', cost: 5 }],
    trades: [{ team1: 'Elaf', team2: 'Chuy', team1Gets: ['Romeo Doubs GB (WR)'], team2Gets: ['Round 4, Pick 40'] }],
  } as unknown as SeasonData
  const rosters = {
    Elaf: ['Josh Allen BUF (QB)', 'Bijan Robinson ATL RB', 'Kareem Hunt (RB, KC)', 'Romeo Doubs GB (WR)', 'Mystery Man'],
    Chuy: [],
  }
  const view = buildRosterView(rosters, season)
  const elaf = view.find((v) => v.team === 'Elaf')!
  const by = (name: string) => elaf.players.find((p) => p.player === name)!
  check('roster view: draft pick tagged', describeAcquisition(by('Bijan Robinson').acquired) === 'Rd 1 · #1')
  check('roster view: waiver tagged with fee', describeAcquisition(by('Kareem Hunt').acquired) === 'Waiver wk 2 · $5')
  check('roster view: trade tagged with counterpart', describeAcquisition(by('Romeo Doubs').acquired) === 'Trade ← Chuy')
  check('roster view: unknown provenance blank', by('Mystery Man').acquired === undefined && describeAcquisition(undefined) === '')
  check('roster view: sorted QB, RB, WR', elaf.players.slice(0, 3).map((p) => p.position).join(',') === 'QB,RB,RB', elaf.players.map((p) => p.position))
  check('roster view: position counts', elaf.byPosition.RB === 2 && elaf.byPosition.QB === 1 && elaf.byPosition['?'] === 1, elaf.byPosition)
  check('roster view: parses every historical cell shape', parseDraftCell('Kareem Hunt (RB, KC)').player === 'Kareem Hunt')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
