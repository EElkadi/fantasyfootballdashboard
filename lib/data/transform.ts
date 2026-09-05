import { DraftPick, DraftSlot, LineupEntry, Matchup, NextPick, PlayerScore, PlayerWeek, PoolPlayer, Prediction, ScheduleWeek, Slot, SLOTS, TeamLineup, TeamWeek, Trade, WaiverMove } from '@/lib/types'
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
 * Fallback label when no Adjustments entry explains a total/player-sum gap.
 * Clean -5 multiples match the constitution's confirmation penalty (§VII).
 */
export function defaultAdjustmentNote(points: number): string {
  if (points < 0 && points % 5 === 0) return 'Late confirmation penalty (§VII)'
  return 'Commissioner score adjustment'
}

function attachAdjustment(side: TeamLineup): void {
  const sum = side.players.reduce((s, p) => s + p.score, 0)
  const diff = side.total - sum
  if (diff !== 0 && side.players.some((p) => p.player)) {
    side.adjustment = diff
    side.adjustmentNote = defaultAdjustmentNote(diff)
  }
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
  attachAdjustment(team1)
  attachAdjustment(team2)
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
    attachAdjustment(t1)
    attachAdjustment(t2)
    const winner = r.Result === 'Win' ? team : opp
    matchups.push({ week, team1: t1, team2: t2, winner, loser: winner === team ? opp : team })
  }
  return matchups.sort((a, b) => a.week - b.week)
}

/** Overall pick number in a snake draft (even rounds run right-to-left). */
export function snakeOverall(round: number, slot: number, teams: number): number {
  const posInRound = round % 2 === 1 ? slot : teams - slot + 1
  return (round - 1) * teams + posInRound
}

/** Inverse of snakeOverall: which (round, slot) is pick N overall. */
export function snakePosition(overall: number, teams: number): { round: number; slot: number } {
  const round = Math.ceil(overall / teams)
  const pos = overall - (round - 1) * teams
  return { round, slot: round % 2 === 1 ? pos : teams - pos + 1 }
}

/** Teams tab rows (DRAFT ORDER / TEAMS) -> draft order, ascending by slot. */
export function rowsToDraftOrder(rows: Record<string, string>[]): DraftSlot[] {
  const order: DraftSlot[] = []
  for (const r of rows) {
    const slot = parseInt(col(r, 'draft order', 'order', 'slot'))
    const team = canonTeam(col(r, 'teams', 'team', 'owner'))
    if (slot > 0 && team) order.push({ slot, team })
  }
  return order.sort((a, b) => a.slot - b.slot)
}

/** Draft order recovered from the picks themselves (archived seasons have no Teams tab). */
export function orderFromPicks(picks: DraftPick[]): DraftSlot[] {
  const bySlot = new Map<number, string>()
  for (const p of picks) if (!bySlot.has(p.slot)) bySlot.set(p.slot, p.team)
  return Array.from(bySlot.entries())
    .map(([slot, team]) => ({ slot, team }))
    .sort((a, b) => a.slot - b.slot)
}

/**
 * The first empty snake position, or null once the board is full. Needs a
 * complete order (slots 1..n with no gaps) — a partial one returns null
 * rather than guessing.
 */
export function nextDraftPick(picks: DraftPick[], order: DraftSlot[], rounds: number): NextPick | null {
  const teams = order.length
  if (teams === 0 || order.some((o, i) => o.slot !== i + 1)) return null
  const taken = new Set(picks.map((p) => `${p.round}|${p.slot}`))
  for (let overall = 1; overall <= rounds * teams; overall++) {
    const { round, slot } = snakePosition(overall, teams)
    if (!taken.has(`${round}|${slot}`)) return { round, slot, overall, team: order[slot - 1].team }
  }
  return null
}

/** How many picks before `team` is up (0 = on the clock), or null if they have none left. */
export function picksUntil(next: NextPick | null, order: DraftSlot[], rounds: number, team: string): number | null {
  if (!next) return null
  const teams = order.length
  for (let overall = next.overall; overall <= rounds * teams; overall++) {
    const { slot } = snakePosition(overall, teams)
    if (order[slot - 1]?.team === team) return overall - next.overall
  }
  return null
}

function numberPicks<T extends { round: number; slot: number }>(picks: T[]): (T & { overall: number })[] {
  const teams = Math.max(12, ...picks.map((p) => p.slot))
  return picks
    .map((p) => ({ ...p, overall: snakeOverall(p.round, p.slot, teams) }))
    .sort((a, b) => a.overall - b.overall)
}

/** Archived draft.csv rows or equivalent -> DraftPick[] */
export function rowsToDraft(rows: { Round: string; Slot: string; Team: string; Player: string }[]): DraftPick[] {
  return numberPicks(
    rows
      .map((r) => {
        const parsed = parseSheetPlayer(r.Player ?? '')
        return {
          round: parseInt(r.Round),
          slot: parseInt(r.Slot),
          team: canonTeam(r.Team ?? ''),
          ...parsed,
        }
      })
      .filter((p) => p.round > 0 && p.player),
  )
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
  const maxSlot = Math.max(0, ...Array.from(order.keys()))
  const picks: Omit<DraftPick, 'overall'>[] = []
  // Scan every row — the header row won't match the round pattern, so this
  // also tolerates a board tab without a header.
  for (const row of board) {
    const roundMatch = (row[0] ?? '').match(/round\s*0*(\d+)/i)
    if (!roundMatch) continue
    const round = parseInt(roundMatch[1])
    for (let col = 1; col <= maxSlot; col++) {
      const team = order.get(col)
      const cell = (row[col] ?? '').trim()
      if (!team || !cell) continue
      picks.push({ round, slot: col, team, ...parseDraftCell(cell) })
    }
  }
  return numberPicks(picks)
}

/**
 * Trades rows (TEAM 1 | TEAM 1 GETS | TEAM 2 | TEAM 2 GETS) -> Trade[].
 * Live tab rows list one asset per line with blank team cells continuing the
 * previous trade; archived trades.csv packs assets with "; " separators.
 */
export function rowsToTrades(rows: Record<string, string>[]): Trade[] {
  const trades: Trade[] = []
  for (const r of rows) {
    const t1 = canonTeam(r['Team 1'] ?? r['TEAM 1'] ?? '')
    const t2 = canonTeam(r['Team 2'] ?? r['TEAM 2'] ?? '')
    const g1 = (r['Team 1 Gets'] ?? r['TEAM 1 GETS'] ?? '').trim()
    const g2 = (r['Team 2 Gets'] ?? r['TEAM 2 GETS'] ?? '').trim()
    if (t1 && t2) trades.push({ team1: t1, team2: t2, team1Gets: [], team2Gets: [] })
    const current = trades[trades.length - 1]
    if (!current) continue
    if (g1) current.team1Gets.push(...g1.split(';').map((s) => s.trim()).filter(Boolean))
    if (g2) current.team2Gets.push(...g2.split(';').map((s) => s.trim()).filter(Boolean))
  }
  return trades.filter((t) => t.team1Gets.length > 0 || t.team2Gets.length > 0)
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
  // Only trust a parenthesized suffix that is an actual position — trade
  // assets like "Monaf's 1st Round Pick (Pick 4)" must not parse as players
  if (parenPos.position && POSITIONS.has(parenPos.position)) return parenPos
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
      // Accept any capitalization of the week column, like the other parsers
      const weekKey = Object.keys(row).find((k) => k.trim().toLowerCase() === 'week')
      const weekRaw = weekKey ? row[weekKey] : ''
      const weekNum = parseInt(weekRaw.replace(/[^\d]/g, ''))
      if (!weekNum) return null
      const label = /rivalry/i.test(weekRaw) ? 'Rivalry Week' : undefined
      const opponents: Record<string, string> = {}
      for (const [col, val] of Object.entries(row)) {
        if (col === weekKey || !val) continue
        opponents[canonTeam(col)] = canonTeam(val)
      }
      return { week: weekNum, label, opponents }
    })
    .filter((w): w is ScheduleWeek => w !== null)
    .sort((a, b) => a.week - b.week)
}

/** A week's matchups as unique pairs, each team appearing once. */
export function pairsOf(week: ScheduleWeek): [string, string][] {
  const seen = new Set<string>()
  const pairs: [string, string][] = []
  for (const [team, opp] of Object.entries(week.opponents)) {
    if (seen.has(team) || seen.has(opp)) continue
    seen.add(team)
    seen.add(opp)
    pairs.push([team, opp])
  }
  return pairs
}

/**
 * Predictions tab: `Submitted | Manager | Order | Champion | Turd | Bold Take`,
 * Order being a comma-separated list, best first. A manager may resubmit
 * before the lock — the latest row wins.
 */
export function rowsToPredictions(rows: Record<string, string>[]): Prediction[] {
  const latest = new Map<string, Prediction>()
  for (const row of rows) {
    const manager = resolveOwner(col(row, 'manager', 'team', 'owner'))?.name
    const order = col(row, 'order')
      .split(/[,|]/)
      .map((n) => canonTeam(n))
      .filter(Boolean)
    if (!manager || order.length < 2) continue
    const pred: Prediction = {
      manager,
      submittedAt: col(row, 'submitted', 'timestamp', 'submitted at'),
      order,
      champion: canonTeam(col(row, 'champion', 'champ')),
      turd: canonTeam(col(row, 'turd')),
      boldTake: col(row, 'bold take', 'take', 'bold') || undefined,
    }
    const prev = latest.get(manager)
    // Rows are appended in time order; timestamps only matter if they disagree
    if (!prev || !prev.submittedAt || !pred.submittedAt || pred.submittedAt >= prev.submittedAt) latest.set(manager, pred)
  }
  return Array.from(latest.values())
}

/** Case-insensitive column lookup by any of several header spellings. */
function col(row: Record<string, string>, ...names: string[]): string {
  const key = Object.keys(row).find((k) => names.includes(k.trim().toLowerCase()))
  return key ? row[key].trim() : ''
}

/** "flex2" / "FLEX 2" / "def" -> canonical Slot, or null */
export function canonSlot(raw: string): Slot | null {
  const key = raw.replace(/\s+/g, '').toLowerCase().replace('d/st', 'def').replace('dst', 'def')
  return SLOTS.find((s) => s.toLowerCase() === key) ?? null
}

/**
 * Lineups tab: `Week | Team | Slot | Player | Submitted`, one row per slot per
 * submission, appended in time order. A Thursday partial ("Flex: Jacobs")
 * followed by Sunday's full lineup merges naturally: the latest row for each
 * week/team/slot wins, and slots nobody resubmitted keep their earlier value.
 */
export function rowsToLineups(rows: Record<string, string>[]): LineupEntry[] {
  const latest = new Map<string, LineupEntry>()
  for (const r of rows) {
    const week = parseInt(col(r, 'week'))
    const team = resolveOwner(col(r, 'team', 'manager', 'owner'))?.name
    const slot = canonSlot(col(r, 'slot', 'position', 'pos'))
    const player = col(r, 'player', 'name')
    if (!week || !team || !slot || !player) continue
    const entry: LineupEntry = { week, team, slot, player, submittedAt: col(r, 'submitted', 'timestamp', 'submitted at') }
    const key = `${week}|${team}|${slot}`
    const prev = latest.get(key)
    if (!prev || !prev.submittedAt || !entry.submittedAt || entry.submittedAt >= prev.submittedAt) latest.set(key, entry)
  }
  return Array.from(latest.values()).sort((a, b) => a.week - b.week || a.team.localeCompare(b.team))
}

/** Teams tab rows -> owner -> franchise name, from a "Team Name" column when present. */
export function rowsToTeamNames(rows: Record<string, string>[]): Record<string, string> {
  const names: Record<string, string> = {}
  for (const r of rows) {
    const owner = resolveOwner(col(r, 'teams', 'team', 'owner', 'manager'))?.name
    const name = col(r, 'team name', 'teamname', 'franchise', 'franchise name')
    if (owner && name) names[owner] = name
  }
  return names
}

/** Player Pool tab (`Player Name | Team | Position`) -> PoolPlayer[], row order = rank. */
export function rowsToPool(rows: Record<string, string>[]): PoolPlayer[] {
  const pool: PoolPlayer[] = []
  for (const r of rows) {
    const player = col(r, 'player name', 'player', 'name').replace(/\s+/g, ' ')
    if (!player) continue
    const nflTeam = col(r, 'team', 'nfl team', 'nfl').toUpperCase() || undefined
    const rawPos = col(r, 'position', 'pos').toUpperCase().replace('D/ST', 'DEF').replace('DST', 'DEF')
    pool.push({ player, nflTeam, position: rawPos || undefined, rank: pool.length + 1 })
  }
  return pool
}
