import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { gridToSchedule, longToMatchups, matchupsToTeamWeeks, matchupsToPlayerWeeks, rowsToPredictions, pairsOf } from '../lib/data/transform'
import { computeStandings, h2hIndexOf, rankTeams, weeklyScoreOrder } from '../lib/data/standings'
import { weeklyAwards, seasonAwards, tallyAwards } from '../lib/data/awards'
import { recapText } from '../lib/recap/text'
import { recapMetrics } from '../lib/recap/metrics'
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
    draftOrder: [],
    waivers: [],
    trades: [],
    teamNames: {},
    lineups: [],
    pool: [],
    draftGrades: [],
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

// --- Standings tiebreaks: record, then head-to-head, then points scored ---
{
  const h2h = (pairs: [string, string][]) => {
    const m = new Map<string, number>()
    for (const [w, l] of pairs) m.set(`${w}|${l}`, (m.get(`${w}|${l}`) ?? 0) + 1)
    return m
  }
  const row = (team: string, wins: number, pointsFor: number) => ({ team, wins, losses: 20 - wins, pointsFor })

  const beat = rankTeams([row('A', 12, 1200), row('B', 12, 1400)], h2h([['A', 'B']]))
  check('tiebreak: head-to-head outranks points scored', beat[0] === 'A', beat)

  const split = rankTeams([row('A', 12, 1200), row('B', 12, 1400)], h2h([['A', 'B'], ['B', 'A']]))
  check('tiebreak: a split series falls through to points scored', split[0] === 'B', split)

  const never = rankTeams([row('A', 12, 1200), row('B', 12, 1400)], h2h([]))
  check('tiebreak: teams that never met fall through to points scored', never[0] === 'B', never)

  const record = rankTeams([row('A', 11, 9999), row('B', 12, 1)], h2h([['A', 'B']]))
  check('tiebreak: record comes before any tiebreaker', record[0] === 'B', record)

  // A beat both, B beat C — head-to-head decides all three despite C scoring most
  const three = rankTeams(
    [row('A', 12, 1000), row('B', 12, 1100), row('C', 12, 1500)],
    h2h([['A', 'B'], ['A', 'C'], ['B', 'C']]),
  )
  check('tiebreak: three-way tie resolved by the mini-league', three.join() === 'A,B,C', three)

  // Once A is placed, B and C revert to the plain two-team rule
  const restart = rankTeams(
    [row('A', 12, 1000), row('B', 12, 1100), row('C', 12, 1500)],
    h2h([['A', 'B'], ['A', 'C'], ['C', 'B']]),
  )
  check('tiebreak: group re-resolves after each team is placed', restart.join() === 'A,C,B', restart)

  const even = h2h([])
  check(
    'tiebreak: dead-even teams order deterministically',
    rankTeams([row('A', 12, 1000), row('B', 12, 1000)], even).join() ===
      rankTeams([row('B', 12, 1000), row('A', 12, 1000)], even).join(),
  )

  // Real seasons never contradict the rule
  for (const [year, season] of [[2025, s2025], [2024, s2024]] as const) {
    const idx = h2hIndexOf(season.matchups.filter((m) => m.week <= 14))
    const net = (x: string, y: string) => (idx.get(`${x}|${y}`) ?? 0) - (idx.get(`${y}|${x}`) ?? 0)
    let broken: string | null = null
    season.standings.forEach((a, i) => {
      const b = season.standings[i + 1]
      if (!b) return
      if (a.overall.wins < b.overall.wins) broken = `${a.team} above ${b.team} on fewer wins`
      const tied = a.overall.wins === b.overall.wins && a.overall.losses === b.overall.losses
      const groupSize = season.standings.filter(
        (t) => t.overall.wins === a.overall.wins && t.overall.losses === a.overall.losses,
      ).length
      // Adjacent pairs are only decisive when the whole tied group is those two
      if (tied && groupSize === 2) {
        const n = net(a.team, b.team)
        if (n < 0 || (n === 0 && a.pointsFor < b.pointsFor)) broken = `${a.team} above ${b.team}`
      }
    })
    check(`standings ${year}: order obeys record → head-to-head → points`, broken === null, broken)
    check(`standings ${year}: ranks run 1..n in order`, season.standings.every((s, i) => s.rank === i + 1))
  }
}

// --- Weekly scoring order (the top-6 game) ---
{
  const week1 = weeklyScoreOrder(s2025.teamWeeks, s2025.matchups, 1)
  check('weekly: every team appears once, highest first', week1.length === 12 && week1.every((r, i) => i === 0 || week1[i - 1].score >= r.score))
  check('weekly: ranks are 1..12', week1.every((r, i) => r.rank === i + 1))
  check('weekly: exactly six make the cut', week1.filter((r) => r.top6).length === 6)
  check('weekly: the cut is the top six of the order', week1.slice(0, 6).every((r) => r.top6) && week1.slice(6).every((r) => !r.top6))
  check('weekly: a week nobody played is empty', weeklyScoreOrder(s2025.teamWeeks, s2025.matchups, 18).length === 0)

  // The card and the standings must agree on who banked the extra win
  const tallied = new Map<string, number>()
  for (let w = 1; w <= 14; w++) {
    for (const r of weeklyScoreOrder(s2025.teamWeeks, s2025.matchups, w)) {
      if (r.top6) tallied.set(r.team, (tallied.get(r.team) ?? 0) + 1)
    }
  }
  check(
    'weekly: top-6 wins match the standings',
    s2025.standings.every((s) => (tallied.get(s.team) ?? 0) === s.top6.wins),
    s2025.standings.map((s) => `${s.team} ${tallied.get(s.team) ?? 0}/${s.top6.wins}`),
  )
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
  const standingsLines = text.split('\n').slice(text.split('\n').findIndex((l) => l.startsWith('*Standings*')))
  check('recap: playoff line drawn after 7th', standingsLines.findIndex((l) => l === '———') === standingsLines.findIndex((l) => l.startsWith('7. ')) + 1)
  check('recap: six next-week pairings', pairsOf(next).length === 6 && pairsOf(next).every(([a, b]) => text.includes(`${a} vs ${b}`)))
  check('recap: ends with the link', text.endsWith('https://example.test/matchups?week=3'))
  const weekly = weeklyScoreOrder(s2025.teamWeeks, s2025.matchups, week)
  const withScores = recapText({
    season: 2025,
    week,
    regularSeasonWeeks: 14,
    playoffTeams: 7,
    results,
    weeklyScores: weekly,
    awards: [],
  })
  const wsLines = withScores.split('\n')
  const wsStart = wsLines.findIndex((l) => l.startsWith('*Weekly scoring*'))
  check('recap: weekly scoring section present', wsStart > -1 && wsLines[wsStart].includes('top 6'), wsLines[wsStart])
  check('recap: all twelve scores listed in order', weekly.every((r) => wsLines.includes(`${r.rank}. ${r.team} ${r.score}`)), wsLines.slice(wsStart, wsStart + 14))
  check('recap: cut line drawn after the sixth score', wsLines[wsStart + 7] === '———', wsLines.slice(wsStart + 6, wsStart + 9))
  check('recap: weekly scoring omitted for playoff weeks', !recapText({ season: 2025, week: 16, regularSeasonWeeks: 14, playoffTeams: 7, results, awards: [] }).includes('*Weekly scoring*'))

  const playoff = recapText({ season: 2025, week: 16, weekLabel: 'Semifinals', regularSeasonWeeks: 14, playoffTeams: 7, results: results.slice(0, 2), awards: [] })
  check('recap: playoff week uses the label, no standings', playoff.startsWith('🏈 *PLFF 2025 · Semifinals Recap*') && !playoff.includes('*Standings*'), playoff)
}

// --- Recap metrics: everything the weekly recap reports, as of that week ---
{
  const w1 = recapMetrics(s2025, 1)
  check('metrics: week 1 has no playoff odds yet, and says why', w1.standings.every((s) => !s.odds) && w1.oddsNote === 'Playoff odds start after week 2', w1.oddsNote)
  check('metrics: week 1 power has no movement to show', w1.power!.every((p) => p.move === null))

  const w5 = recapMetrics(s2025, 5)
  check('metrics: odds for every team mid-season', w5.standings.every((s) => s.odds && /^(IN|OUT|<1%|>99%|\d+%)$/.test(s.odds)), w5.standings.map((s) => s.odds))
  check('metrics: power ranked high to low', w5.power!.every((p, i) => i === 0 || w5.power![i - 1].power >= p.power))
  check('metrics: movement nets to zero across the league', w5.power!.reduce((sum, p) => sum + (p.move ?? 0), 0) === 0)
  check('metrics: standings reflect only games through that week', w5.standings.every((s) => s.record.split('-').map(Number).reduce((a, b) => a + b) === 10), w5.standings.map((s) => s.record))
  check('metrics: awards are that week\'s', w5.awards.length > 0 && w5.awards.every((a) => a.week === 5))

  const w14 = recapMetrics(s2025, 14)
  check('metrics: after week 14 the line is final', w14.standings.every((s, i) => s.odds === (i < 7 ? 'IN' : 'OUT')), w14.standings.map((s) => s.odds))
  const lucky = w14.luckiest!
  check('metrics: luckiest has the biggest luck index', lucky.length > 0 && s2025.standings.every((s) => s.luck <= lucky[0].luck), lucky)
  const w7 = recapMetrics(s2025, 7)
  const worst = Math.min(...w7.power!.map((p) => p.luck))
  check('metrics: every team tied for the worst luck is named', w7.unluckiest!.length === w7.power!.filter((p) => p.luck === worst).length && w7.unluckiest!.length > 1, w7.unluckiest)

  const w16 = recapMetrics(s2025, 16)
  check('metrics: playoff weeks drop power, scoring order and luck', !w16.power && !w16.weeklyScores && !w16.luckiest && !w16.unluckiest)
  check('metrics: playoff weeks still hand out awards', w16.awards.length > 0)

  const text = recapText({
    season: 2025,
    week: 5,
    regularSeasonWeeks: 14,
    playoffTeams: 7,
    results: [],
    awards: w5.awards,
    standings: w5.standings,
    power: w5.power,
    luckiest: w5.luckiest,
    unluckiest: w5.unluckiest,
  })
  const lines = text.split('\n')
  check('recap: standings header mentions playoff odds', lines.some((l) => l === '*Standings* (top 7 in · playoff odds)'))
  check('recap: each standing carries its odds', w5.standings.every((s, i) => lines.includes(`${i + 1}. ${s.team} ${s.record} · ${s.odds}`)))
  const pStart = lines.indexOf('*Power rankings*')
  check('recap: power rankings listed with movement', pStart > -1 && w5.power!.every((p) => lines.slice(pStart).some((l) => l.startsWith(`${p.rank}. ${p.team} ${p.power}`))), lines.slice(pStart, pStart + 13))
  check('recap: movement arrows render', lines.slice(pStart).some((l) => /[▲▼–]/.test(l)))
  if (w5.luckiest) check('recap: luck index section present', lines.some((l) => l.startsWith('🍀 ') && w5.luckiest!.every((t) => l.includes(t.team))))
  const tieText = recapText({ season: 2025, week: 7, regularSeasonWeeks: 14, playoffTeams: 7, results: [], awards: [], unluckiest: w7.unluckiest })
  check('recap: a luck tie lists every team', w7.unluckiest!.every((t) => tieText.includes(t.team)) && tieText.includes(`🥶 ${worst} — `), tieText)
  const w1Text = recapText({ season: 2025, week: 1, regularSeasonWeeks: 14, playoffTeams: 7, results: [], awards: [], standings: w1.standings, oddsNote: w1.oddsNote, power: w1.power })
  check('recap: week 1 explains the missing odds, no arrows', w1Text.includes('_Playoff odds start after week 2_') && !/[▲▼]/.test(w1Text))
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
