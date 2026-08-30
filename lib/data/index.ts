import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { unstable_cache } from 'next/cache'
import { Matchup, ScheduleWeek, SeasonData } from '@/lib/types'
import { ACTIVE_OWNERS, ARCHIVED_SEASONS, CURRENT_SEASON, LEAGUE } from '@/lib/league'
import { hasLiveSheet, readTab, toObjects, SCORES_TAB, SCHEDULE_TAB, ROSTERS_TAB } from './sheets'
import {
  canonTeam,
  gridToSchedule,
  longToMatchups,
  matchupsToPlayerWeeks,
  matchupsToTeamWeeks,
  wideRowToMatchup,
} from './transform'
import { computeStandings } from './standings'

const DATA_DIR = path.join(process.cwd(), 'data', 'seasons')

async function readCsv(season: number, file: string): Promise<Record<string, string>[]> {
  try {
    const content = await fs.readFile(path.join(DATA_DIR, String(season), file), 'utf8')
    return parse(content, { columns: true, skip_empty_lines: true, trim: true })
  } catch {
    return []
  }
}

function assemble(season: number, source: SeasonData['source'], matchups: Matchup[], schedule: ScheduleWeek[]): SeasonData {
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
  }
}

async function loadArchiveSeason(season: number): Promise<SeasonData> {
  const [teamRows, playerRows, scheduleRows] = await Promise.all([
    readCsv(season, 'teams.csv'),
    readCsv(season, 'players.csv'),
    readCsv(season, 'schedule.csv'),
  ])
  const matchups = longToMatchups(teamRows as any, playerRows as any)
  return assemble(season, matchups.length ? 'archive' : 'empty', matchups, gridToSchedule(scheduleRows))
}

async function loadLiveSeason(season: number): Promise<SeasonData> {
  const [scoreRows, scheduleRows] = await Promise.all([
    readTab(SCORES_TAB).catch(() => [] as string[][]),
    readTab(SCHEDULE_TAB).catch(() => [] as string[][]),
  ])
  const matchups = toObjects(scoreRows)
    .map(wideRowToMatchup)
    .filter((m): m is Matchup => m !== null)
  const schedule = gridToSchedule(toObjects(scheduleRows))
  return assemble(season, 'sheet', matchups, schedule)
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
export async function getSeason(season: number = CURRENT_SEASON): Promise<SeasonData> {
  if (season === CURRENT_SEASON && hasLiveSheet()) {
    try {
      return await cachedLive(season)
    } catch (err) {
      console.error('Live sheet read failed, falling back to archive:', err)
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

/** Current rosters, for the commissioner parser: team -> players. */
export async function getRosters(): Promise<Record<string, string[]>> {
  if (!hasLiveSheet()) return {}
  try {
    const rows = await readTab(ROSTERS_TAB)
    if (rows.length < 2) return {}
    const header = rows[0]
    const rosters: Record<string, string[]> = {}
    header.forEach((team, col) => {
      const owner = canonTeam(team)
      if (!owner) return
      rosters[owner] = rows
        .slice(1)
        .map((r) => (r[col] ?? '').trim())
        .filter(Boolean)
    })
    return rosters
  } catch {
    return {}
  }
}
