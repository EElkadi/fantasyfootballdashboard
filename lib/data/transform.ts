import { DraftPick, Matchup, PlayerScore, PlayerWeek, ScheduleWeek, Slot, SLOTS, TeamLineup, TeamWeek, WaiverMove } from '@/lib/types'
import { resolveOwner } from '@/lib/league'

/** Canonicalize a team spelling from any source (sheet, CSV, chat). */
export function canonTeam(name: string): string {
  return resolveOwner(name)?.name ?? name.trim()
}

/** "Josh Allen BUF (QB)" -> { player: "Josh Allen", nflTeam: "BUF", position: "QB" } */
export function parseSheetPlayer(raw: string): { player: string; nflTeam?: string; position?: string } {
  const cleaned = raw.trim()
  const posMatch = cleaned.match(/\(([^)]+)\)\s*$/)
  const position = posMatch ? posMatch[1].trim().toUpperCase().replace('D/ST', 'DEF') : undefined
  let name = posMatch ? cleaned.slice(0, posMatch.index).trim() : cleaned
  let nflTeam: string | undefined
  const teamMatch = name.match(/\s([A-Z]{2,3})$/)
  if (teamMatch) {
    nflTeam = teamMatch[1]
    name = name.slice(0, teamMatch.index).trim()
  }
  return { player: name, nflTeam, position }
}

function num(v: string | undefined): number {
  const n = parseFloat((v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * One wide Scores row (keyed by header) -> a Matchup.
 * Column layout: Week, Team 1, <slot pairs>, Total1, Team 2, <slot _2 pairs>, Total2, Winner, Loser.
 */
export function wideRowToMatchup(row: Record<string, string>): Matchup | null {
  const week = parseInt(row['Week'])
  const team1Name = canonTeam(row['Team 1'] ?? '')
  const team2Name = canonTeam(row['Team 2'] ?? '')
  if (!week || !team1Name || !team2Name) return null

  const lineup = (suffix: '' | '_2', teamName: string, totalKey: string): TeamLineup => {
    const players: PlayerScore[] = SLOTS.map((slot) => {
      const nameKey = `${slot}${suffix} Name`
      const scoreKey = `${slot}${suffix}`
      const raw = row[nameKey] ?? ''
      const parsed = parseSheetPlayer(raw)
      return { slot, raw, ...parsed, score: num(row[scoreKey]) }
    })
    const stated = num(row[totalKey])
    const computed = players.reduce((s, p) => s + p.score, 0)
    // Trust the sheet total when present (it may carry deductions/forfeits)
    return { team: teamName, players, total: row[totalKey] !== undefined && row[totalKey] !== '' ? stated : computed }
  }

  const team1 = lineup('', team1Name, 'Total1')
  const team2 = lineup('_2', team2Name, 'Total2')
  const winner = canonTeam(row['Winner'] ?? '') || (team1.total >= team2.total ? team1Name : team2Name)
  const loser = winner === team1Name ? team2Name : team1Name
  return { week, team1, team2, winner, loser }
}

export function matchupsToTeamWeeks(matchups: Matchup[]): TeamWeek[] {
  const rows: TeamWeek[] = []
  for (const m of matchups) {
    rows.push({
      week: m.week,
      team: m.team1.team,
      score: m.team1.total,
      opponent: m.team2.team,
      result: m.winner === m.team1.team ? 'Win' : 'Loss',
    })
    rows.push({
      week: m.week,
      team: m.team2.team,
      score: m.team2.total,
      opponent: m.team1.team,
      result: m.winner === m.team2.team ? 'Win' : 'Loss',
    })
  }
  return rows
}

export function matchupsToPlayerWeeks(matchups: Matchup[]): PlayerWeek[] {
  const rows: PlayerWeek[] = []
  for (const m of matchups) {
    for (const side of [m.team1, m.team2]) {
      for (const p of side.players) {
        if (!p.player) continue
        rows.push({ week: m.week, team: side.team, player: p.player, slot: p.slot, score: p.score, position: p.position })
      }
    }
  }
  return rows
}

/**
 * Rebuild matchups from long-format archive rows (teams.csv + players.csv).
 * Pairs (week, team, opponent) rows; lineups come from player rows.
 */
export function longToMatchups(
  teamRows: { Week: string; Team: string; Score: string; Opponent: string; Result: string }[],
  playerRows: { Week: string; Team: string; Player: string; Score: string; Position: string }[],
): Matchup[] {
  const lineupIndex = new Map<string, PlayerScore[]>()
  for (const r of playerRows) {
    const key = `${r.Week}|${canonTeam(r.Team)}`
    if (!lineupIndex.has(key)) lineupIndex.set(key, [])
    const parsed = parseSheetPlayer(r.Player)
    lineupIndex.get(key)!.push({ slot: r.Position as Slot, ...parsed, raw: r.Player, score: num(r.Score) })
  }

  const seen = new Set<string>()
  const matchups: Matchup[] = []
  for (const r of teamRows) {
    const week = parseInt(r.Week)
    const team = canonTeam(r.Team)
    const opp = canonTeam(r.Opponent)
    const pairKey = `${week}|${[team, opp].sort().join('|')}`
    if (seen.has(pairKey)) continue
    seen.add(pairKey)
    const oppRow = teamRows.find((o) => parseInt(o.Week) === week && canonTeam(o.Team) === opp)
    const t1: TeamLineup = { team, players: lineupIndex.get(`${week}|${team}`) ?? [], total: num(r.Score) }
    const t2: TeamLineup = {
      team: opp,
      players: lineupIndex.get(`${week}|${opp}`) ?? [],
      total: oppRow ? num(oppRow.Score) : 0,
    }
    const winner = r.Result === 'Win' ? team : opp
    matchups.push({ week, team1: t1, team2: t2, winner, loser: winner === team ? opp : team })
  }
  return matchups.sort((a, b) => a.week - b.week)
}

/** Archived draft.csv rows or equivalent -> DraftPick[] */
export function rowsToDraft(rows: { Round: string; Slot: string; Team: string; Player: string }[]): DraftPick[] {
  return rows
    .map((r) => {
      const parsed = parseSheetPlayer(r.Player ?? '')
      return {
        round: parseInt(r.Round),
        slot: parseInt(r.Slot),
        team: canonTeam(r.Team ?? ''),
        ...parsed,
      }
    })
    .filter((p) => p.round > 0 && p.player)
    .sort((a, b) => a.round - b.round || a.slot - b.slot)
}

/** Waiver rows (Week/Team/Player/Cost) -> WaiverMove[] */
export function rowsToWaivers(rows: Record<string, string>[]): WaiverMove[] {
  return rows
    .map((r) => {
      const week = parseInt(r['Week'] ?? r['WEEK'] ?? '')
      const team = canonTeam(r['Team'] ?? r['TEAM'] ?? '')
      const raw = r['Player'] ?? r['PLAYER'] ?? ''
      const cost = parseFloat((r['Cost'] ?? r['COST'] ?? '0').replace(/[^\d.]/g, ''))
      const parsed = parseSheetPlayer(raw)
      return { week, team, ...parsed, cost: Number.isFinite(cost) ? cost : 0 }
    })
    .filter((m) => m.week > 0 && m.team && m.player)
    .sort((a, b) => a.week - b.week)
}

/**
 * Live "Final Draft Board" grid + "Teams" tab rows -> DraftPick[].
 * The board's columns follow draft order; the Teams tab maps order -> owner.
 */
export function gridToDraft(board: string[][], teamsRows: Record<string, string>[]): DraftPick[] {
  const order = new Map<number, string>()
  for (const r of teamsRows) {
    const n = parseInt(r['DRAFT ORDER'] ?? '')
    const owner = canonTeam(r['TEAMS'] ?? '')
    if (n && owner) order.set(n, owner)
  }
  const picks: DraftPick[] = []
  for (const row of board.slice(1)) {
    const roundMatch = (row[0] ?? '').match(/round\s*0*(\d+)/i)
    if (!roundMatch) continue
    const round = parseInt(roundMatch[1])
    for (let col = 1; col <= 12; col++) {
      const team = order.get(col)
      const cell = (row[col] ?? '').trim()
      if (!team || !cell) continue
      picks.push({ round, slot: col, team, ...parseDraftCell(cell) })
    }
  }
  return picks.sort((a, b) => a.round - b.round || a.slot - b.slot)
}

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST'])

/** "Bijan Robinson ATL RB" / "Kareem Hunt (RB, KC)" / "Name TEAM (POS)" -> parts */
export function parseDraftCell(cell: string): { player: string; nflTeam?: string; position?: string } {
  const s = cell.replace(/\s+/g, ' ').trim()
  const posTeam = s.match(/^(.*?)\s*\(([^,)]+),\s*([^)]+)\)$/)
  if (posTeam && POSITIONS.has(posTeam[2].trim().toUpperCase().replace('D/ST', 'DEF'))) {
    return {
      player: posTeam[1].trim(),
      nflTeam: posTeam[3].trim().toUpperCase(),
      position: posTeam[2].trim().toUpperCase().replace('D/ST', 'DEF').replace('DST', 'DEF'),
    }
  }
  const parenPos = parseSheetPlayer(s)
  if (parenPos.position) return parenPos
  const toks = s.replace(/\((QB|RB|WR|TE|K|DEF|D\/ST)\)/gi, ' ').replace(/\s+/g, ' ').trim().split(' ')
  let position: string | undefined
  let nflTeam: string | undefined
  const last = toks[toks.length - 1]?.toUpperCase().replace('D/ST', 'DEF')
  if (last && POSITIONS.has(last)) {
    position = last === 'DST' ? 'DEF' : last
    toks.pop()
  }
  const maybeTeam = toks[toks.length - 1]
  if (maybeTeam && /^[A-Z]{2,3}$/.test(maybeTeam) && !['II', 'III', 'IV'].includes(maybeTeam)) {
    nflTeam = maybeTeam
    toks.pop()
  }
  return { player: toks.join(' ').trim(), nflTeam, position }
}

/** Schedule grid (Week column + one column per team) -> ScheduleWeek[] */
export function gridToSchedule(rows: Record<string, string>[]): ScheduleWeek[] {
  return rows
    .map((row): ScheduleWeek | null => {
      const weekRaw = row['Week'] ?? ''
      const weekNum = parseInt(weekRaw.replace(/[^\d]/g, ''))
      if (!weekNum) return null
      const label = /rivalry/i.test(weekRaw) ? 'Rivalry Week' : undefined
      const opponents: Record<string, string> = {}
      for (const [col, val] of Object.entries(row)) {
        if (col === 'Week' || !val) continue
        opponents[canonTeam(col)] = canonTeam(val)
      }
      return { week: weekNum, label, opponents }
    })
    .filter((w): w is ScheduleWeek => w !== null)
    .sort((a, b) => a.week - b.week)
}
