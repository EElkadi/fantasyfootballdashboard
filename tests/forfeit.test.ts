import { forfeitScoreRow, matchupsToTeamWeeks, wideRowToMatchup } from '../lib/data/transform'
import { computeStandings, h2hIndexOf, weeklyScoreOrder } from '../lib/data/standings'
import { scoreRowFor } from '../lib/data/scoreRows'
import { weeklyAwards } from '../lib/data/awards'
import { buildRecordBook } from '../lib/data/records'
import { recapText } from '../lib/recap/text'
import { ACTIVE_OWNERS } from '../lib/league'
import { Matchup, SeasonData, SLOTS } from '../lib/types'

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}

// The 43-column Scores header
const header = [
  'Week',
  'Team 1',
  ...SLOTS.flatMap((s) => [`${s} Name`, s]),
  'Total1',
  'Team 2',
  ...SLOTS.flatMap((s) => [`${s}_2 Name`, `${s}_2`]),
  'Total2',
  'Winner',
  'Loser',
]
const toRow = (cells: (string | number)[]) => Object.fromEntries(header.map((h, i) => [h, String(cells[i] ?? '')]))

const teams = ACTIVE_OWNERS.map((o) => o.name)
check('league has 12 teams', teams.length === 12, teams.length)

// Week 1: five played matchups, one double forfeit (the last pair)
const played = (week: number, a: string, b: string, sa: number, sb: number): Matchup => {
  const side = (team: string, total: number) => ({
    team,
    total,
    players: SLOTS.map((slot, i) => ({ slot, player: `${team} ${slot}`, score: i === 0 ? total : 0 })),
  })
  return { week, team1: side(a, sa), team2: side(b, sb), winner: sa >= sb ? a : b, loser: sa >= sb ? b : a }
}
const [fa, fb] = [teams[10], teams[11]]
const row = forfeitScoreRow(1, fa, fb)
check('forfeit row has 43 cells', row.length === 43 && header.length === 43, row.length)
const forfeit = wideRowToMatchup(toRow(row))
check('forfeit row parses as a forfeit, not a placeholder', !!forfeit?.forfeit && forfeit.winner === '' && forfeit.loser === '', forfeit)
check('forfeit totals are 0', forfeit?.team1.total === 0 && forfeit?.team2.total === 0)
check('a hand-typed "Forfeit" winner cell also counts', !!wideRowToMatchup(toRow([1, fa, ...Array(18).fill(''), '', fb, ...Array(18).fill(''), '', 'Forfeit', '']))?.forfeit)
check('week + teams with no scores is still a placeholder', wideRowToMatchup(toRow([1, fa, ...Array(18).fill(''), '', fb])) === null)

const matchups: Matchup[] = [
  played(1, teams[0], teams[1], 120, 110),
  played(1, teams[2], teams[3], 100, 90),
  played(1, teams[4], teams[5], 80, 70),
  played(1, teams[6], teams[7], 60, 50),
  played(1, teams[8], teams[9], 40, 30),
  forfeit!,
]
const teamWeeks = matchupsToTeamWeeks(matchups)
const fRows = teamWeeks.filter((r) => r.forfeit)
check('both forfeit teams lose with 0', fRows.length === 2 && fRows.every((r) => r.result === 'Loss' && r.score === 0), fRows)

const standings = computeStandings(teamWeeks, matchups)
for (const t of [fa, fb]) {
  const s = standings.find((x) => x.team === t)!
  check(`${t} goes 0-2`, s.overall.wins === 0 && s.overall.losses === 2 && s.h2h.losses === 1 && s.top6.losses === 1, s)
}
check('six teams still bank the top-6 win', standings.filter((s) => s.top6.wins === 1).length === 6)
// 5 head-to-head wins + 6 top-6 wins; the forfeit hands out no win at all
check('league total is 11 wins, 13 losses', standings.reduce((n, s) => n + s.overall.wins, 0) === 11 && standings.reduce((n, s) => n + s.overall.losses, 0) === 13)
check('a forfeit settles no head-to-head tiebreak', h2hIndexOf(matchups).size === 5)

// Short week: only the forfeit and one game are in. Half of 4 is 2, but the
// forfeit teams must not take the second top-6 win by default.
const short = [played(2, teams[0], teams[1], 90, 80), { ...forfeit!, week: 2 }]
const order = weeklyScoreOrder(matchupsToTeamWeeks(short), short, 2)
check('forfeits rank last and never make the cut', order.slice(2).every((r) => r.forfeit && !r.top6) && order.slice(0, 2).every((r) => r.top6), order)

// Awards and records ignore the 0-0
const season = { season: 2026, matchups, teamWeeks, playerWeeks: [], standings, weeks: [1], teams, waivers: [], trades: [], draft: [] } as unknown as SeasonData
const awards = weeklyAwards(season, 1)
check('nailbiter is a real game', awards.find((a) => a.key === 'nailbiter')?.team === teams[0], awards)
check('no award goes to a forfeit team', awards.every((a) => a.team !== fa && a.team !== fb && a.team !== ''), awards)
const book = buildRecordBook([season])
check('closest game record is a real game', book.games.find((g) => g.label === 'Closest game')?.holder === teams[0], book.games)
check('lowest score record is not the forfeit', book.games.find((g) => g.label === 'Lowest single-week score')?.holder === teams[9])

// Recap text
const text = recapText({
  season: 2026,
  week: 1,
  regularSeasonWeeks: 14,
  playoffTeams: 6,
  results: [{ winner: fa, loser: fb, winScore: 0, loseScore: 0, forfeit: true }],
  weeklyScores: weeklyScoreOrder(teamWeeks, matchups, 1),
  awards: [],
})
check('recap names the double forfeit', text.includes(`${fa} 0 – 0 ${fb} (double forfeit, both 0-2)`), text)
check('recap marks forfeits in the scoring order', text.includes(`12. `) && text.split('\n').filter((l) => l.endsWith('(forfeit)')).length === 2, text)

// Row placement: the forfeit takes the matchup's row, and real scores take it back
const grid = [header, ['1', teams[0], ...Array(19).fill(''), teams[1]], row.map(String)]
const again = scoreRowFor(grid, 1, fb, fa)
check('saving scores later replaces the forfeit row', again.row === 3 && again.replacing, again)

console.log(failures === 0 ? '\nAll forfeit tests passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
