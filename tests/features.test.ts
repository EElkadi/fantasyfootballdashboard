import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { gridToSchedule, longToMatchups, matchupsToTeamWeeks, matchupsToPlayerWeeks, rowsToPredictions, pairsOf } from '../lib/data/transform'
import { computeStandings } from '../lib/data/standings'
import { weeklyAwards, seasonAwards, tallyAwards } from '../lib/data/awards'
import { recapText } from '../lib/recap/text'
import { consensusOrder, scorePredictions } from '../lib/data/predictions'
import { careerSummary, trophyCase } from '../lib/data/career'
import { buildRecordBook } from '../lib/data/records'
import { SeasonData } from '../lib/types'

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${label}`, detail ?? '')
  } else console.log(`ok   ${label}`)
}

const csv = (path: string): any[] => parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })

function loadSeason(year: number): SeasonData {
  const matchups = longToMatchups(csv(`data/seasons/${year}/teams.csv`), csv(`data/seasons/${year}/players.csv`))
  const teamWeeks = matchupsToTeamWeeks(matchups)
  const regular = teamWeeks.filter((r) => r.week <= 14)
  const standings = computeStandings(regular, matchups.filter((m) => m.week <= 14))
  const weeks = Array.from(new Set(matchups.map((m) => m.week))).sort((a, b) => a - b)
  return {
    season: year,
    source: 'archive',
    teams: standings.map((s) => s.team),
    weeks,
    lastCompletedWeek: Math.max(...weeks),
    matchups,
    teamWeeks,
    playerWeeks: matchupsToPlayerWeeks(matchups),
    standings,
    schedule: gridToSchedule(csv(`data/seasons/${year}/schedule.csv`)),
    draft: [],
    waivers: [],
    trades: [],
    teamNames: {},
    lineups: [],
  }
}

const s2025 = loadSeason(2025)
const s2024 = loadSeason(2024)

// --- Weekly awards ---
{
  const week = 1
  const rows = s2025.teamWeeks.filter((r) => r.week === week)
  const awards = weeklyAwards(s2025, week)
  const by = (k: string) => awards.find((a) => a.key === k)
  const high = [...rows].sort((a, b) => b.score - a.score)[0]
  const low = [...rows].filter((r) => r.score > 0).sort((a, b) => a.score - b.score)[0]
  check('awards: top gun is the week high', by('topGun')?.team === high.team, by('topGun'))
  check('awards: cupcake is the week low', by('cupcake')?.team === low.team, by('cupcake'))
  const nail = by('nailbiter')!
  const margins = s2025.matchups.filter((m) => m.week === week).map((m) => Math.abs(m.team1.total - m.team2.total))
  check('awards: nailbiter is the tightest margin', nail.detail.includes(`by ${Math.min(...margins)}`) || Math.min(...margins) === 0, nail)
  check('awards: hammer is the widest margin', by('hammer')?.detail.includes(`by ${Math.max(...margins)}`) === true, by('hammer'))
  const bb = by('badBeat')
  if (bb) {
    const row = rows.find((r) => r.team === bb.team)!
    const rank = [...rows].sort((a, b) => b.score - a.score).findIndex((r) => r.team === bb.team)
    check('awards: bad beat lost with a top-half score', row.result === 'Loss' && rank < 6, bb)
  }
  const heist = by('heist')
  if (heist) {
    const row = rows.find((r) => r.team === heist.team)!
    const rank = [...rows].sort((a, b) => b.score - a.score).findIndex((r) => r.team === heist.team)
    check('awards: heist won with a bottom-half score', row.result === 'Win' && rank >= 6, heist)
  }
  check('awards: no awards for an unplayed week', weeklyAwards(s2025, 18).length === 0)
  const all = seasonAwards(s2025)
  const tally = tallyAwards(all, s2025.teams)
  check('awards: tally sums to the award count', tally.reduce((s, t) => s + t.total, 0) === all.length)
  check('awards: every team appears in the tally', tally.length === 12)
}

// --- Recap text ---
{
  const week = 3
  const matchups = s2025.matchups.filter((m) => m.week === week)
  const results = matchups.map((m) => {
    const w = m.team1.team === m.winner ? m.team1 : m.team2
    const l = m.team1.team === m.winner ? m.team2 : m.team1
    return { winner: m.winner, loser: m.loser, winScore: w.total, loseScore: l.total, tiebreaker: w.total === l.total }
  })
  const next = s2025.schedule.find((s) => s.week === week + 1)!
  const text = recapText({
    season: 2025,
    week,
    regularSeasonWeeks: 14,
    playoffTeams: 7,
    results,
    awards: weeklyAwards(s2025, week),
    mvp: { player: 'Josh Allen', team: 'Chuy', score: 34, slot: 'QB' },
    standings: s2025.standings.slice(0, 12).map((s) => ({ team: s.team, record: `${s.overall.wins}-${s.overall.losses}` })),
    nextWeek: { week: week + 1, label: next.label, pairs: pairsOf(next) },
    url: 'https://example.test/matchups?week=3',
  })
  check('recap: title and sections present', /\*PLFF 2025 · Week 3 Recap\*/.test(text) && text.includes('*Results*') && text.includes('*Awards*') && text.includes('*Standings*'), text.split('\n').slice(0, 3))
  check('recap: six result lines', results.every((r) => text.includes(`${r.winner} ${r.winScore} – ${r.loseScore} ${r.loser}`)))
  check('recap: playoff line drawn after 7th', text.split('\n').findIndex((l) => l === '———') === text.split('\n').findIndex((l) => l.startsWith('7. ')) + 1)
  check('recap: six next-week pairings', pairsOf(next).length === 6 && pairsOf(next).every(([a, b]) => text.includes(`${a} vs ${b}`)))
  check('recap: ends with the link', text.endsWith('https://example.test/matchups?week=3'))
  const playoff = recapText({ season: 2025, week: 16, weekLabel: 'Semifinals', regularSeasonWeeks: 14, playoffTeams: 7, results: results.slice(0, 2), awards: [] })
  check('recap: playoff week uses the label, no standings', playoff.startsWith('🏈 *PLFF 2025 · Semifinals Recap*') && !playoff.includes('*Standings*'), playoff)
}

// --- Predictions ---
{
  const teams = ['Paco', 'ATL', 'Chuy', 'Gaybo', 'Kenny', 'Elaf', 'Julio', 'Jay', 'Monaf', 'Greg', 'Bala', 'Choy']
  const rows = [
    { Submitted: '2026-09-01T10:00:00Z', Manager: 'Eloy', Order: teams.join(', '), Champion: 'Zeus', Turd: 'Greg', 'Bold Take': 'first' },
    { Submitted: '2026-09-02T10:00:00Z', Manager: 'Elaf', Order: [...teams].reverse().join(', '), Champion: 'Elaf', Turd: 'Paco', 'Bold Take': 'second' },
    { Submitted: '2026-09-02T11:00:00Z', Manager: 'Mono', Order: teams.join(', '), Champion: 'Paco', Turd: 'Choy', 'Bold Take': '' },
    { Submitted: '', Manager: 'Nobody', Order: teams.join(', '), Champion: 'Paco', Turd: 'Choy', 'Bold Take': '' },
  ]
  const preds = rowsToPredictions(rows)
  check('predictions: aliases canonicalized, unknown dropped', preds.map((p) => p.manager).sort().join() === 'Elaf,Monaf', preds.map((p) => p.manager))
  const elaf = preds.find((p) => p.manager === 'Elaf')!
  check('predictions: latest ballot wins', elaf.boldTake === 'second' && elaf.order[0] === 'Choy' && elaf.champion === 'Elaf', elaf)
  check('predictions: bold take blank -> undefined', preds.find((p) => p.manager === 'Monaf')!.boldTake === undefined)

  const standings = teams.map((team, i) => ({ team, rank: i + 1 }))
  const scores = scorePredictions(preds, standings, { champion: 'Paco' })
  check('predictions: perfect ballot has zero error and 12 exact', scores[0].manager === 'Monaf' && scores[0].error === 0 && scores[0].exact === 12, scores[0])
  // Fully reversed: sum of |i - (13 - i)| for i=1..12 = 72
  check('predictions: reversed ballot error is 72', scores[1].manager === 'Elaf' && scores[1].error === 72 && scores[1].exact === 0, scores[1])
  check('predictions: champion hit/miss marked', scores[0].championHit === true && scores[1].championHit === false && scores[1].turdHit === undefined)
  const consensus = consensusOrder(preds, teams)
  check('predictions: consensus averages ballots', consensus[0].avgRank === 6.5 && consensus.length === 12, consensus.slice(0, 2))
  // Elaf placed himself 7th (reversed list: Elaf is index 6). Consensus of Elaf: (6 + 7) / 2 = 6.5 -> rank ties resolved by avg; homer defined
  check('predictions: homer index computed for own team', typeof scores[1].homer === 'number', scores[1])
}

// --- Career + trophy case ---
{
  const seasons = [s2025, s2024]
  const chuy = careerSummary(seasons, 'Chuy')!
  const s25 = s2025.standings.find((s) => s.team === 'Chuy')!
  const s24 = s2024.standings.find((s) => s.team === 'Chuy')!
  check('career: two seasons for Chuy', chuy.seasons === 2)
  check('career: wins sum across seasons', chuy.overall.wins === s25.overall.wins + s24.overall.wins, chuy.overall)
  check('career: playoff appearances counted', chuy.playoffAppearances === [s25, s24].filter((s) => s.rank <= 7).length, chuy.playoffAppearances)
  check('career: best week is the max', chuy.bestWeek!.score === Math.max(...seasons.flatMap((s) => s.teamWeeks.filter((r) => r.team === 'Chuy').map((r) => r.score))))
  check('career: unknown manager -> null', careerSummary(seasons, 'Nobody') === null)
  const bala = careerSummary(seasons, 'Bala')
  check('career: new manager has no history yet', bala === null)

  const book = buildRecordBook(seasons)
  const trophies = trophyCase('Chuy', book)
  check('trophies: 2025 title, 2024 runner-up and scoring champ', trophies.some((t) => t.title === 'League Champion' && t.season === 2025) && trophies.some((t) => t.title === 'Runner-up' && t.season === 2024) && trophies.some((t) => t.title === 'Scoring Champ' && t.season === 2024), trophies.map((t) => `${t.title} ${t.season}`))
  check('trophies: honors sort before records', trophies.findIndex((t) => t.tier === 'record') === -1 || trophies.findIndex((t) => t.tier === 'record') > trophies.filter((t) => t.tier === 'honor').length - 1)
  check('trophies: Marco holds the 2024 Turd', trophyCase('Marco', book).some((t) => t.emoji === '💩'))
  // "Highest-scoring game" credits both teams as "A & B" — each side gets the trophy
  const shootout = book.games.find((e) => e.label === 'Highest-scoring game')!
  const [a, b] = shootout.holder.split(' & ')
  check('trophies: shootout credited to both teams', trophyCase(a, book).some((t) => t.title === shootout.label) && trophyCase(b, book).some((t) => t.title === shootout.label), shootout.holder)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
