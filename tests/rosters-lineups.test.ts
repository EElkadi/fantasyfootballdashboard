import { rowsToLineups, rowsToTeamNames, rowsToPool, canonSlot, parseDraftCell, rowsToDraftOrder, orderFromPicks, nextDraftPick, picksUntil } from '../lib/data/transform'
import { searchPool, bestAvailable, enrichFromPool, poolIndex, formatPoolPlayer, playerSlug, takenKeys, samePlayer, cellRef } from '../lib/players'
import { parseSubmission } from '../lib/parser/parse'
import { buildRosterView, describeAcquisition, freeAgents } from '../lib/data/rosterView'
import { parseRankings, draftedBy, seedFromPool, poolKey, reconcileOrder, moveKey, applyTextImport, orderToText } from '../lib/draftBoard'
import { DraftPick } from '../lib/types'
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
    pool: [],
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

// --- Player pool ---
{
  const pool = rowsToPool([
    { 'Player Name': 'Jahmyr Gibbs', Team: 'DET', Position: 'RB' },
    { 'Player Name': 'Bijan Robinson', Team: 'ATL', Position: 'RB' },
    { 'Player Name': "Ja'Marr Chase", Team: 'CIN', Position: 'WR' },
    { 'Player Name': 'Josh Allen', Team: 'BUF', Position: 'QB' },
    { 'Player Name': 'Denver Broncos', Team: 'DEN', Position: 'D/ST' },
    { 'Player Name': '', Team: '', Position: '' },
    { 'Player Name': 'Josh Jacobs', Team: 'GB', Position: 'RB' },
  ])
  check('pool: rows parsed in order, blanks skipped, D/ST -> DEF', pool.length === 6 && pool[0].rank === 1 && pool[4].position === 'DEF' && pool[5].rank === 6, pool)
  check('pool: format writes the draft-cell form', formatPoolPlayer(pool[0]) === 'Jahmyr Gibbs DET RB')

  const hits = (q: string) => searchPool(pool, q).map((p) => p.player)
  check('pool search: partial tokens', hits('j gib').join() === 'Jahmyr Gibbs', hits('j gib'))
  check('pool search: last name', hits('gibbs').join() === 'Jahmyr Gibbs')
  check('pool search: apostrophe-insensitive', hits('jamarr').join() === "Ja'Marr Chase", hits('jamarr'))
  check('pool search: prefix beats pool order', hits('josh')[0] === 'Josh Allen' && hits('josh').length === 2, hits('josh'))
  check('pool search: excludes taken', searchPool(pool, 'josh', 8, takenKeys(pool, [{ player: 'Josh Allen' }])).map((p) => p.player).join() === 'Josh Jacobs')
  check('pool search: empty query -> nothing', searchPool(pool, '  ').length === 0)

  const avail = bestAvailable(pool, takenKeys(pool, [{ player: 'Jahmyr Gibbs' }]), 1)
  check('best available: skips taken, one per position', avail.RB?.[0].player === 'Bijan Robinson' && avail.QB?.[0].player === 'Josh Allen' && avail.RB.length === 1, avail)

  const enriched = enrichFromPool({ player: 'Josh Allen' } as { player: string; position?: string; nflTeam?: string }, poolIndex(pool))
  check('enrich: bare name gains position and team', enriched.position === 'QB' && enriched.nflTeam === 'BUF', enriched)
  const kept = enrichFromPool({ player: 'Josh Allen', position: 'RB', nflTeam: 'XX' }, poolIndex(pool))
  check('enrich: explicit values win over the pool', kept.position === 'RB' && kept.nflTeam === 'XX')

  const fa = freeAgents(pool, { Elaf: ['Josh Allen BUF QB', 'Bijan Robinson'], Chuy: ["Ja'Marr Chase CIN (WR)"] })
  check('free agents: rostered removed regardless of cell format', fa.RB?.map((p) => p.player).join() === 'Jahmyr Gibbs,Josh Jacobs' && !fa.QB && !fa.WR, fa)

  // Two players, one name: the NFL team keeps them apart
  const twins = rowsToPool([
    { 'Player Name': 'Mike Williams', Team: 'NYJ', Position: 'WR' },
    { 'Player Name': 'Mike Williams', Team: 'LAC', Position: 'WR' },
    { 'Player Name': 'Jahmyr Gibbs', Team: 'Detroit Lions', Position: 'RB' },
  ])
  const oneTaken = bestAvailable(twins, takenKeys(twins, [{ player: 'Mike Williams', nflTeam: 'NYJ' }]))
  check('twins: drafting one Mike Williams leaves the other available', oneTaken.WR?.length === 1 && oneTaken.WR[0].nflTeam === 'LAC', oneTaken)
  check('twins: bare name still matches a unique player', bestAvailable(twins, takenKeys(twins, [{ player: 'Jahmyr Gibbs' }])).RB === undefined)
  check('samePlayer: teams must agree only when both known', samePlayer({ player: 'Mike Williams' }, { player: 'Mike Williams', nflTeam: 'LAC' }) && !samePlayer({ player: 'Mike Williams', nflTeam: 'NYJ' }, { player: 'Mike Williams', nflTeam: 'LAC' }))
  check('cellRef: reads team off a board cell', cellRef('Bijan Robinson ATL RB').nflTeam === 'ATL' && cellRef('Bijan Robinson').nflTeam === undefined)
  check('format: a non-abbreviated team is left off so the cell round-trips', formatPoolPlayer(twins[2]) === 'Jahmyr Gibbs RB' && playerSlug(cellRef(formatPoolPlayer(twins[2])).player) === 'jahmyr-gibbs')
  const odd = bestAvailable(rowsToPool([{ 'Player Name': 'Some Kicker', Team: 'DAL', Position: 'PK' }]), new Set())
  check('best available: unknown position lands in "?" rather than vanishing', odd['?']?.[0].player === 'Some Kicker', odd)

  // Ambiguous pool match is surfaced, not hidden
  const amb = parseSubmission('Elaf\nQB: Josh', { rosters: { Elaf: ['Bijan Robinson ATL RB'] }, lineupOnly: true, pool: ['Josh Allen', 'Josh Jacobs'] })
  check('parser: ambiguous pool match lists the alternatives', amb.lineups[0].players[0].issues.some((i) => i.startsWith('Could be:')), amb.lineups[0].players[0].issues)

  // Parser fallback: unrostered but in the pool
  const parsed = parseSubmission('Elaf\nQB: Jsh Allen', {
    rosters: { Elaf: ['Bijan Robinson ATL RB'] },
    lineupOnly: true,
    pool: pool.map((p) => p.player),
  })
  const qb = parsed.lineups[0].players[0]
  check('parser: pool fixes spelling but keeps the roster flag', qb.name === 'Josh Allen' && qb.issues.some((i) => /Not found on Elaf's roster.*player pool/.test(i)), qb)
}

// --- Personal draft board ---
{
  const pool = rowsToPool([
    { 'Player Name': 'Jahmyr Gibbs', Team: 'DET', Position: 'RB' },
    { 'Player Name': 'Bijan Robinson', Team: 'ATL', Position: 'RB' },
    { 'Player Name': "Ja'Marr Chase", Team: 'CIN', Position: 'WR' },
    { 'Player Name': 'Matthew Stafford', Team: 'LAR', Position: 'QB' },
    { 'Player Name': 'Mike Williams', Team: 'NYJ', Position: 'WR' },
    { 'Player Name': 'Mike Williams', Team: 'LAC', Position: 'WR' },
  ])
  const text = ['1. Bijan Robinson', '2) Jamarr Chase', '', '## Tier 2', 'Mathew Stafford', 'Mike Williams LAC', 'Some Rookie', '---', '12 - Jahmyr Gibbs'].join('\n')
  const board = parseRankings(text, pool)
  check('board: numbering stripped, blanks skipped, ranks sequential', board.map((e) => e.rank).join() === '1,2,3,4,5,6' && board.length === 6, board.map((e) => e.raw))
  check('board: exact and fuzzy matches resolve to pool names', board[1].name === "Ja'Marr Chase" && board[2].name === 'Matthew Stafford' && board[2].match !== undefined, board.slice(1, 3))
  check('board: tier header applies to following entries', board[2].tier === 'Tier 2' && board[0].tier === undefined && board[5].tier !== 'Tier 2', board.map((e) => e.tier))
  check('board: typed team picks the right twin', board[3].match?.nflTeam === 'LAC', board[3])
  check('board: unknown name kept but unmatched', board[4].name === 'Some Rookie' && board[4].match === undefined)
  check('board: position filled from the pool', board[0].position === 'RB' && board[1].position === 'WR')

  const picks = [
    { round: 1, slot: 1, overall: 1, team: 'Paco', player: 'Bijan Robinson', nflTeam: 'ATL', position: 'RB' },
    { round: 1, slot: 2, overall: 2, team: 'Chuy', player: 'Mike Williams', nflTeam: 'NYJ', position: 'WR' },
  ] as DraftPick[]
  check('board: drafted entry crossed out with the owner', draftedBy(board[0], picks)?.team === 'Paco')
  check('board: the other Mike Williams stays available', draftedBy(board[3], picks) === undefined)
  check('board: fuzzy-matched entry still crosses out', draftedBy(board[2], [{ ...picks[0], player: 'Matthew Stafford', nflTeam: 'LAR' }] as DraftPick[]) !== undefined)
  check('board: seed text round-trips through the parser', parseRankings(seedFromPool(pool), pool).every((e) => e.match) && parseRankings(seedFromPool(pool), pool).length === pool.length)

  // Draggable order: a permutation of the pool that survives pool changes
  const keys = pool.map(poolKey)
  check('order: twins get distinct keys', keys[4] !== keys[5] && keys[4].endsWith('|NYJ'))
  const fresh = reconcileOrder([], pool)
  check('order: empty save -> pool order', fresh.join() === keys.join())
  const saved = [keys[2], 'ghost|XX', keys[0], keys[0]]
  const rec = reconcileOrder(saved, pool)
  check('order: reconcile drops unknowns and dupes, appends newcomers in pool order', rec.join() === [keys[2], keys[0], keys[1], keys[3], keys[4], keys[5]].join(), rec)
  const moved = moveKey(fresh, keys[5], keys[1])
  check('order: move puts the dragged key where the target was', moved.indexOf(keys[5]) === 1 && moved.length === 6 && new Set(moved).size === 6, moved)
  check('order: move onto self is a no-op', moveKey(fresh, keys[0], keys[0]) === fresh)
  const imp = applyTextImport(fresh, 'Mathew Stafford\nJamarr Chase\nNobody Real', pool)
  check('order: import puts pasted players on top, rest keep order, unmatched reported', imp.order.slice(0, 2).join() === [keys[3], keys[2]].join() && imp.order.length === 6 && imp.unmatched.join() === 'Nobody Real', imp)
  const exported = orderToText(moved, pool)
  check('order: export/import round-trips exactly', applyTextImport(fresh, exported, pool).order.join() === moved.join(), exported)
}

// --- On the clock ---
{
  const order = rowsToDraftOrder([
    { 'DRAFT ORDER': '3', TEAMS: 'Elaf', 'Team Name': 'El Facho' },
    { 'DRAFT ORDER': '1', TEAMS: 'Paco' },
    { 'DRAFT ORDER': '2', TEAMS: 'Zeus' },
    { 'DRAFT ORDER': '', TEAMS: 'Nobody' },
  ])
  check('order: sorted by slot, aliases canonicalized', order.map((o) => `${o.slot}${o.team}`).join() === '1Paco,2Chuy,3Elaf', order)
  const pick = (round: number, slot: number, team: string) => ({ round, slot, overall: 0, team, player: `P${round}${slot}` })
  const picks = [pick(1, 1, 'Paco'), pick(1, 2, 'Chuy'), pick(1, 3, 'Elaf'), pick(2, 3, 'Elaf')]
  const next = nextDraftPick(picks, order, 3)
  check('next: snake reverses in round 2', next?.round === 2 && next?.slot === 2 && next?.team === 'Chuy' && next?.overall === 5, next)
  check('next: partial order refuses to guess', nextDraftPick(picks, order.slice(1), 3) === null)
  check('next: full board -> null', nextDraftPick([...picks, pick(2, 2, 'Chuy'), pick(2, 1, 'Paco'), pick(3, 1, 'Paco'), pick(3, 2, 'Chuy'), pick(3, 3, 'Elaf')], order, 3) === null)
  check('until: on the clock is 0', picksUntil(next, order, 3, 'Chuy') === 0)
  check('until: Paco is one away, then round 3 flips back', picksUntil(next, order, 3, 'Paco') === 1 && picksUntil(next, order, 3, 'Elaf') === 4, [picksUntil(next, order, 3, 'Paco'), picksUntil(next, order, 3, 'Elaf')])
  check('until: unknown team -> null', picksUntil(next, order, 3, 'Ghost') === null)
  check('orderFromPicks: recovers the order from a board', orderFromPicks(picks as any).map((o) => o.team).join() === 'Paco,Chuy,Elaf')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
