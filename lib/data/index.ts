import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { unstable_cache } from 'next/cache'
import { DraftGrade, DraftSlot, LineupEntry, Matchup, PoolPlayer, Prediction, ScheduleWeek, SeasonData } from '@/lib/types'
import { ACTIVE_OWNERS, ARCHIVED_SEASONS, CURRENT_SEASON, LEAGUE, resolveOwner } from '@/lib/league'
import { hasLiveSheet, readTab, readTabs, serviceAccountEmail, toObjects, SHEET_ID, SCORES_TAB, SCHEDULE_TABS, ROSTERS_TAB, DRAFT_TAB, WAIVERS_TAB, TEAMS_TAB, ADJUSTMENTS_TAB, TRADES_TAB, PREDICTIONS_TAB, LINEUPS_TAB, PLAYER_POOL_TAB, GRADES_TAB } from './sheets'
import {
  canonTeam,
  gridToDraft,
  gridToSchedule,
  longToMatchups,
  matchupsToPlayerWeeks,
  matchupsToTeamWeeks,
  orderFromPicks,
  rowsToDraft,
  rowsToDraftOrder,
  rowsToGrades,
  rowsToLineups,
  rowsToPool,
  rowsToPredictions,
  rowsToTeamNames,
  rowsToTrades,
  rowsToWaivers,
  gridToRosters,
  wideRowToMatchup,
} from './transform'
import { computeStandings } from './standings'
import { enrichFromPool, poolIndex } from '@/lib/players'

const DATA_DIR = path.join(process.cwd(), 'data', 'seasons')

async function readCsv(season: number, file: string): Promise<Record<string, string>[]> {
  try {
    const content = await fs.readFile(path.join(DATA_DIR, String(season), file), 'utf8')
    return parse(content, { columns: true, skip_empty_lines: true, trim: true })
  } catch {
    return []
  }
}

/** Overlay commissioner-supplied reasons onto detected total adjustments. */
function annotateAdjustments(matchups: Matchup[], meta: Record<string, string>[]): void {
  if (meta.length === 0) return
  const reasons = new Map<string, string>()
  for (const r of meta) {
    const week = parseInt(r['Week'] ?? r['WEEK'] ?? '')
    const team = canonTeam(r['Team'] ?? r['TEAM'] ?? '')
    const reason = (r['Reason'] ?? r['REASON'] ?? '').trim()
    if (week && team && reason) reasons.set(`${week}|${team}`, reason)
  }
  for (const m of matchups) {
    for (const side of [m.team1, m.team2]) {
      if (side.adjustment === undefined) continue
      const reason = reasons.get(`${m.week}|${side.team}`)
      if (reason) side.adjustmentNote = reason
    }
  }
}

function assemble(
  season: number,
  source: SeasonData['source'],
  matchups: Matchup[],
  schedule: ScheduleWeek[],
  draft: SeasonData['draft'] = [],
  waivers: SeasonData['waivers'] = [],
  trades: SeasonData['trades'] = [],
  teamNames: Record<string, string> = {},
  lineups: LineupEntry[] = [],
  pool: PoolPlayer[] = [],
  draftOrder: DraftSlot[] = [],
  draftGrades: DraftGrade[] = [],
): SeasonData {
  // Before the first pick the order can only come from the Teams tab; after
  // it, the picks themselves are just as good — so an archive works too
  if (draftOrder.length === 0) draftOrder = orderFromPicks(draft)
  // The pool knows every player's position and NFL team, so a bare "Josh
  // Allen" typed anywhere still colors and ranks correctly
  if (pool.length > 0) {
    const index = poolIndex(pool)
    draft = draft.map((p) => enrichFromPool(p, index))
    waivers = waivers.map((w) => enrichFromPool(w, index))
  }
  const teamWeeks = matchupsToTeamWeeks(matchups)
  const playerWeeks = matchupsToPlayerWeeks(matchups)
  // Standings only count the regular season; playoff matchups (weeks 15+)
  // still show up in matchups, records, and team results.
  const regular = (week: number) => week <= LEAGUE.regularSeasonWeeks
  const standings = computeStandings(
    teamWeeks.filter((r) => regular(r.week)),
    matchups.filter((m) => regular(m.week)),
  )
  const weeks = Array.from(new Set(matchups.map((m) => m.week))).sort((a, b) => a - b)
  const teams =
    standings.length > 0
      ? standings.map((s) => s.team)
      : schedule.length > 0
        ? Object.keys(schedule[0].opponents)
        : ACTIVE_OWNERS.map((o) => o.name)
  return {
    season,
    source,
    teams,
    weeks,
    lastCompletedWeek: weeks.length ? Math.max(...weeks) : 0,
    matchups,
    teamWeeks,
    playerWeeks,
    standings,
    schedule,
    draft,
    draftOrder,
    waivers,
    trades,
    teamNames,
    lineups,
    pool,
    draftGrades,
  }
}

async function loadArchiveSeason(season: number): Promise<SeasonData> {
  const [teamRows, playerRows, scheduleRows, draftRows, waiverRows, adjustmentRows, tradeRows, lineupRows, gradeRows] =
    await Promise.all([
      readCsv(season, 'teams.csv'),
      readCsv(season, 'players.csv'),
      readCsv(season, 'schedule.csv'),
      readCsv(season, 'draft.csv'),
      readCsv(season, 'waivers.csv'),
      readCsv(season, 'adjustments.csv'),
      readCsv(season, 'trades.csv'),
      readCsv(season, 'lineups.csv'),
      readCsv(season, 'grades.csv'),
    ])
  const matchups = longToMatchups(teamRows as any, playerRows as any)
  annotateAdjustments(matchups, adjustmentRows)
  return assemble(
    season,
    matchups.length ? 'archive' : 'empty',
    matchups,
    gridToSchedule(scheduleRows),
    rowsToDraft(draftRows as any),
    rowsToWaivers(waiverRows),
    rowsToTrades(tradeRows),
    {},
    rowsToLineups(lineupRows),
    [],
    [],
    rowsToGrades(gradeRows),
  )
}

async function loadLiveSeason(season: number): Promise<SeasonData> {
  // One batched read for every tab. A missing tab is empty; a failed read
  // throws, so the cache never stores a blank season by mistake.
  const t = await readTabs([
    SCORES_TAB,
    ...SCHEDULE_TABS,
    DRAFT_TAB,
    TEAMS_TAB,
    WAIVERS_TAB,
    ADJUSTMENTS_TAB,
    TRADES_TAB,
    LINEUPS_TAB,
    PLAYER_POOL_TAB,
    GRADES_TAB,
  ])
  const matchups = toObjects(t[SCORES_TAB])
    .map(wideRowToMatchup)
    .filter((m): m is Matchup => m !== null)
  annotateAdjustments(matchups, toObjects(t[ADJUSTMENTS_TAB]))
  // First candidate tab that actually parses as a week grid wins
  let schedule = SCHEDULE_TABS.map((tab) => gridToSchedule(toObjects(t[tab]))).find((s) => s.length > 0) ?? []
  const teamObjects = toObjects(t[TEAMS_TAB])
  let draft = t[DRAFT_TAB].length > 0 && teamObjects.length > 0 ? gridToDraft(t[DRAFT_TAB], teamObjects) : []

  // The committed data/seasons/<year>/ files are a seed for the live season:
  // reference data the Sheet doesn't actually supply — a tab that is empty
  // or not created yet — falls back to them. Scores, waivers and trades are
  // deliberately excluded: those accumulate during the season, so empty is
  // a legitimate state for them.
  if (schedule.length === 0 || draft.length === 0) {
    const seed = await loadArchiveSeason(season)
    if (schedule.length === 0) schedule = seed.schedule
    if (draft.length === 0) draft = seed.draft
  }

  return assemble(
    season,
    'sheet',
    matchups,
    schedule,
    draft,
    rowsToWaivers(toObjects(t[WAIVERS_TAB])),
    rowsToTrades(toObjects(t[TRADES_TAB])),
    rowsToTeamNames(teamObjects),
    rowsToLineups(toObjects(t[LINEUPS_TAB])),
    rowsToPool(toObjects(t[PLAYER_POOL_TAB])),
    rowsToDraftOrder(teamObjects),
    rowsToGrades(toObjects(t[GRADES_TAB])),
  )
}

const cachedLive = unstable_cache(loadLiveSeason, ['live-season'], { revalidate: 60, tags: ['season-live'] })

/** All seasons that can be displayed, newest first. */
export function availableSeasons(): number[] {
  const seasons = new Set<number>(ARCHIVED_SEASONS)
  seasons.add(CURRENT_SEASON)
  return Array.from(seasons).sort((a, b) => b - a)
}

/**
 * Load a season. The current season reads the live Google Sheet when
 * configured; otherwise it falls back to archived CSVs (empty for a season
 * that hasn't started).
 */
/** Last successful live load per season, so a Sheets outage shows stale-but-real data instead of blanks. */
const lastGoodSeason = new Map<number, SeasonData>()

/** Whether this instance is currently serving a fallback instead of the live sheet. */
export interface DataHealth {
  degraded: boolean
  /** When the live read last failed */
  failedAt?: string
  /** What is being shown instead */
  serving?: 'last-good' | 'archive'
  reason?: string
}
let health: DataHealth = { degraded: false }
export function getDataHealth(): DataHealth {
  return health
}

export async function getSeason(season: number = CURRENT_SEASON): Promise<SeasonData> {
  if (season === CURRENT_SEASON && hasLiveSheet()) {
    try {
      const live = await cachedLive(season)
      lastGoodSeason.set(season, live)
      health = { degraded: false }
      return live
    } catch (err) {
      console.error('Live sheet read failed:', err)
      const prev = lastGoodSeason.get(season)
      health = {
        degraded: true,
        failedAt: new Date().toISOString(),
        serving: prev ? 'last-good' : 'archive',
        reason: err instanceof Error ? err.message.slice(0, 160) : String(err),
      }
      if (prev) return prev
    }
  }
  return loadArchiveSeason(season)
}

/**
 * The season to show by default: the current one if it has any data or a
 * schedule, otherwise the most recent archived season.
 */
export async function getDefaultSeason(): Promise<SeasonData> {
  const current = await getSeason(CURRENT_SEASON)
  if (current.matchups.length > 0 || current.schedule.length > 0) return current
  for (const season of availableSeasons()) {
    if (season === CURRENT_SEASON) continue
    const data = await getSeason(season)
    if (data.matchups.length > 0) return data
  }
  return current
}

export async function getAllSeasons(): Promise<SeasonData[]> {
  const seasons = await Promise.all(availableSeasons().map((s) => getSeason(s)))
  return seasons.filter((s) => s.matchups.length > 0)
}

async function loadLivePredictions(): Promise<Prediction[]> {
  return rowsToPredictions(toObjects(await readTab(PREDICTIONS_TAB)))
}
const cachedPredictions = unstable_cache(loadLivePredictions, ['predictions'], {
  revalidate: 60,
  tags: ['predictions'],
})

/**
 * Preseason ballots. The current season reads the Predictions tab; archived
 * seasons (and a sheet without that tab) read data/seasons/<year>/predictions.csv.
 */
export async function getPredictions(season: number = CURRENT_SEASON): Promise<Prediction[]> {
  if (season === CURRENT_SEASON && hasLiveSheet()) {
    try {
      return await cachedPredictions()
    } catch (err) {
      console.warn('Predictions tab could not be read, falling back to archive:', err)
    }
  }
  return rowsToPredictions(await readCsv(season, 'predictions.csv'))
}

const cachedRosters = unstable_cache(async () => gridToRosters(await readTab(ROSTERS_TAB)), ['rosters'], {
  revalidate: 60,
  tags: ['season-live'],
})

/**
 * Current rosters: team -> players. Cached with the season (waiver, trade and
 * draft writes all revalidate it). Empty without a sheet or a Rosters tab.
 */
let lastGoodRosters: Record<string, string[]> | null = null
export async function getRosters(): Promise<Record<string, string[]>> {
  if (!hasLiveSheet()) return {}
  try {
    lastGoodRosters = await cachedRosters()
    return lastGoodRosters
  } catch (err) {
    console.error('Rosters read failed:', err)
    return lastGoodRosters ?? {}
  }
}

export interface TabStatus {
  /** Tab actually read (for schedule, the candidate that won) */
  tab: string
  purpose: string
  /** Raw rows returned by the Sheets API, header included */
  rows: number
  /** Meaningful records parsed out of those rows */
  parsed: number
  unit: string
  status: 'ok' | 'empty' | 'error'
  detail?: string
}

export interface SheetDiagnostics {
  configured: boolean
  sheetId: string
  /** The account the spreadsheet must be shared with, as Editor */
  serviceAccount: string | null
  currentSeason: number
  tabs: TabStatus[]
}

/** Mask all but the last 4 characters of the spreadsheet id. */
function maskId(id: string): string {
  return id.length > 8 ? `…${id.slice(-4)}` : id ? '(set)' : '(unset)'
}

async function probe(
  tab: string,
  purpose: string,
  unit: string,
  count: (rows: string[][]) => number,
): Promise<TabStatus> {
  try {
    const rows = await readTab(tab)
    const parsed = count(rows)
    return {
      tab,
      purpose,
      rows: rows.length,
      parsed,
      unit,
      status: parsed > 0 ? 'ok' : 'empty',
      detail:
        parsed === 0 && rows.length > 0
          ? 'Tab has rows but nothing parsed — check the header row matches what the site expects'
          : undefined,
    }
  } catch (err) {
    return {
      tab,
      purpose,
      rows: 0,
      parsed: 0,
      unit,
      status: 'error',
      detail: err instanceof Error ? err.message.slice(0, 200) : 'Read failed',
    }
  }
}

/**
 * Per-tab health check for the configured Sheet, used by the commissioner
 * page. Makes one read per tab, so it runs on demand rather than on render.
 */
export async function sheetDiagnostics(): Promise<SheetDiagnostics> {
  const base = {
    configured: hasLiveSheet(),
    sheetId: maskId(SHEET_ID),
    serviceAccount: serviceAccountEmail(),
    currentSeason: CURRENT_SEASON,
  }
  if (!base.configured) return { ...base, tabs: [] }

  const [scores, rosters, draft, teams, waivers, trades, adjustments, predictions, lineups, pool, grades] = await Promise.all([
    probe(SCORES_TAB, 'Weekly box scores', 'matchups', (r) =>
      toObjects(r).map(wideRowToMatchup).filter(Boolean).length,
    ),
    // Only headers that resolve to a real owner are usable columns — canonTeam
    // echoes anything else back unchanged, so it can't be the test here.
    probe(ROSTERS_TAB, 'Name matching for the parser', 'columns', (r) =>
      r.length ? r[0].filter((h) => resolveOwner(h ?? '')).length : 0,
    ),
    probe(DRAFT_TAB, 'Draft board', 'rounds', (r) =>
      r.filter((row) => /round\s*\d+/i.test(row[0] ?? '')).length,
    ),
    probe(TEAMS_TAB, 'Draft order (needed for draft night)', 'teams', (r) =>
      toObjects(r).filter((o) => parseInt(o['DRAFT ORDER'] ?? '') > 0 && (o['TEAMS'] ?? '').trim()).length,
    ),
    probe(WAIVERS_TAB, 'Waiver log', 'moves', (r) => rowsToWaivers(toObjects(r)).length),
    probe(TRADES_TAB, 'Trade ledger', 'trades', (r) => rowsToTrades(toObjects(r)).length),
    probe(ADJUSTMENTS_TAB, 'Penalty reasons', 'entries', (r) => toObjects(r).length),
    probe(PREDICTIONS_TAB, 'Preseason ballots', 'ballots', (r) => rowsToPredictions(toObjects(r)).length),
    probe(LINEUPS_TAB, 'Submitted lineups', 'slots', (r) => rowsToLineups(toObjects(r)).length),
    probe(PLAYER_POOL_TAB, 'Draft typeahead, free agents, positions', 'players', (r) => rowsToPool(toObjects(r)).length),
    probe(GRADES_TAB, 'Post-draft grades', 'teams', (r) => rowsToGrades(toObjects(r)).length),
  ])

  // Schedule: report whichever candidate tab actually parses as a week grid
  const candidates = await Promise.all(
    SCHEDULE_TABS.map((tab) => probe(tab, 'Week-by-week grid', 'weeks', (r) => gridToSchedule(toObjects(r)).length)),
  )
  const schedule = candidates.find((c) => c.status === 'ok') ?? candidates[0]

  return { ...base, tabs: [scores, schedule, teams, draft, rosters, waivers, trades, adjustments, predictions, lineups, pool, grades] }
}
