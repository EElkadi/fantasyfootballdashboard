/**
 * Parser for WhatsApp score submissions.
 *
 * Managers report lineups in loosely structured text, e.g.:
 *
 *   Week 11
 *   Chuy vs Larry
 *   QB. Jordan Love: 18pts
 *   RB. Josh Jacobs: 4pts
 *   ...
 *   Total: 101pts
 *
 * but formats drift: "QB: Stafford-31", "WR. Romeo -2", bare "101" total
 * lines, K/DEF order swaps, partial first names, typos. This parser is
 * deliberately forgiving and surfaces everything it is unsure about as
 * issues for the commissioner to review — it never silently guesses.
 *
 * Pure TypeScript, no server dependencies: runs in the browser.
 */

import { Slot } from '@/lib/types'
import { resolveOwner } from '@/lib/league'
import { matchName, rosterDisplayName } from './match'

export interface ParsedPlayer {
  slot: Slot
  /** Name exactly as typed */
  rawName: string
  /** Best-known name (roster match if found, else cleaned raw) */
  name: string
  score: number
  /** True when "Name -N" could mean a negative score */
  ambiguousSign: boolean
  /** 0–1 roster-match confidence; 0 when no roster available */
  confidence: number
  /** Close alternate roster matches */
  alternates: string[]
  issues: string[]
}

export interface ParsedLineup {
  /** Canonical owner name, when known or inferred */
  team?: string
  /** How the team was determined */
  teamSource: 'header' | 'roster' | 'unknown'
  players: ParsedPlayer[]
  statedTotal?: number
  computedTotal: number
  issues: string[]
}

export interface ParseResult {
  week?: number
  lineups: ParsedLineup[]
  issues: string[]
}

const SLOT_ORDER: Record<string, Slot[]> = {
  QB: ['QB'],
  RB: ['RB1', 'RB2'],
  WR: ['WR1', 'WR2'],
  DEF: ['DEF'],
  K: ['K'],
  FLEX: ['Flex', 'Flex2'],
}

/** "RB2: Name", "Flex 2 - Name", "QB. Name" — group 2 is an explicit slot number when given */
const POSITION_RE = /^\s*(QB|RB|WR|K|DEF|D\/?ST|FLEX|FLX)\s*(\d)?\s*[.:)\-–—]*\s*(.*)$/i

function canonPosition(p: string): keyof typeof SLOT_ORDER {
  const up = p.toUpperCase().replace(/[^A-Z]/g, '')
  if (up === 'DST' || up === 'DEF') return 'DEF'
  if (up === 'FLX' || up === 'FLEX') return 'FLEX'
  return up as keyof typeof SLOT_ORDER
}

/** Pull a trailing score off a line: "Josh Jacobs: 4pts" / "Stafford - 31" / "Romeo -2" */
function extractScore(text: string): { name: string; score: number; ambiguousSign: boolean } | null {
  const m = text.match(/^(.*?)\s*([:：]\s*|[-–—]\s*|\s+)(-?\d+(?:\.\d+)?)\s*(?:pts?\.?|points?)?\s*$/i)
  if (!m) return null
  const name = m[1].trim().replace(/[-–—:,\s]+$/, '').trim()
  if (!name) return null
  const score = parseFloat(m[3])
  // "Name -2": the dash is almost always a separator, not a minus sign —
  // flag it so total reconciliation / the commissioner can override.
  const ambiguousSign = /^[-–—]/.test(m[2]) && score > 0
  return { name, score, ambiguousSign }
}

/** Lineup mode: the rest of the line is the name; a stray trailing number is ignored. */
function nameOnly(text: string): { name: string; score: number; ambiguousSign: boolean } | null {
  const name = text
    .replace(/(?:\s*[-–—:]\s*|\s+)-?\d+(?:\.\d+)?\s*(?:pts?\.?|points?)?\s*$/i, '')
    .replace(/[-–—:,\s]+$/, '')
    .trim()
  return name ? { name, score: 0, ambiguousSign: false } : null
}

function normalizeText(input: string): string {
  return input
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/^\[?\d{1,2}[:.]\d{2}.*?\]\s*/gm, '') // WhatsApp "[10:32, 11/17] Name:" prefixes
}

export interface ParseContext {
  /** owner -> roster entries (raw sheet format ok) */
  rosters?: Record<string, string[]>
  /** Expected week, if known */
  week?: number
  /**
   * Pre-deadline lineup submissions: names without scores, partial lineups
   * expected (a Thursday flex, then the rest on Sunday), no totals.
   */
  lineupOnly?: boolean
}

export function parseSubmission(input: string, ctx: ParseContext = {}): ParseResult {
  const rosters = ctx.rosters ?? {}
  const rosterNames: Record<string, string[]> = {}
  for (const [team, entries] of Object.entries(rosters)) {
    rosterNames[team] = entries.map(rosterDisplayName)
  }
  const allRosterNames = Object.values(rosterNames).flat()

  const result: ParseResult = { week: ctx.week, lineups: [], issues: [] }
  const pendingTeams: string[] = []

  const state: { current: ParsedLineup | null } = { current: null }
  const usedSlots = new Set<Slot>()

  const closeLineup = () => {
    if (!state.current) return
    finalizeLineup(state.current)
    result.lineups.push(state.current)
    state.current = null
    usedSlots.clear()
  }

  const finalizeLineup = (lineup: ParsedLineup) => {
    lineup.computedTotal = lineup.players.reduce((s, p) => s + p.score, 0)
    const slots = lineup.players.map((p) => p.slot)
    const missing = (['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'DEF', 'K', 'Flex', 'Flex2'] as Slot[]).filter(
      (s) => !slots.includes(s),
    )
    // A partial lineup is the normal case before the deadline, not a problem
    if (missing.length > 0 && !ctx.lineupOnly) lineup.issues.push(`Missing slots: ${missing.join(', ')}`)

    if (!ctx.lineupOnly && lineup.statedTotal !== undefined && lineup.statedTotal !== lineup.computedTotal) {
      // A single ambiguous "Name -N" read as negative may explain the gap.
      // Apply it only when exactly one flip reconciles; anything murkier is
      // the commissioner's call.
      const flips = lineup.players.filter(
        (p) => p.ambiguousSign && lineup.computedTotal - 2 * p.score === lineup.statedTotal,
      )
      if (flips.length === 1) {
        flips[0].score = -flips[0].score
        flips[0].issues.push('Read as a negative score so the total matches — double-check')
        lineup.computedTotal = lineup.statedTotal
      } else {
        lineup.issues.push(
          `Stated total ${lineup.statedTotal} ≠ sum of players ${lineup.computedTotal} — check the scores`,
        )
      }
    }

    // Team inference from rosters when no header named it
    if (!lineup.team && allRosterNames.length > 0) {
      let best: { team: string; hits: number } | null = null
      let secondHits = 0
      for (const [team, names] of Object.entries(rosterNames)) {
        let hits = 0
        for (const p of lineup.players) {
          if (matchName(p.rawName, names)) hits++
        }
        if (!best || hits > best.hits) {
          secondHits = best?.hits ?? 0
          best = { team, hits }
        } else if (hits > secondHits) {
          secondHits = hits
        }
      }
      if (best && best.hits >= 4 && best.hits > secondHits) {
        lineup.team = best.team
        lineup.teamSource = 'roster'
      }
    }

    // Per-player roster matching against the assigned team (or all rosters)
    for (const p of lineup.players) {
      const pool = lineup.team && rosterNames[lineup.team]?.length ? rosterNames[lineup.team] : allRosterNames
      if (pool.length === 0) continue
      const match = matchName(p.rawName, pool)
      if (match) {
        p.name = match.player
        p.confidence = match.confidence
        p.alternates = match.ambiguous
        if (match.ambiguous.length > 0) {
          p.issues.push(`Could be: ${[match.player, ...match.ambiguous].join(' / ')}`)
        }
      } else {
        p.confidence = 0
        p.issues.push(lineup.team ? `Not found on ${lineup.team}'s roster` : 'Not found on any roster')
      }
    }
  }

  const lines = normalizeText(input).split('\n')
  for (const rawLine of lines) {
    let line = rawLine.trim()
    if (!line) {
      // Lineup posts arrive as separate messages: a blank line ends one
      // manager's partial and starts the next (score mode has totals for that)
      if (ctx.lineupOnly) closeLineup()
      continue
    }

    // WhatsApp export style, "Elaf: Flex Josh Jacobs" — the sender names the team
    const prefixed = line.match(/^([^:]{2,24}?)\s*:\s*(.+)$/)
    if (prefixed && POSITION_RE.test(prefixed[2]) && !POSITION_RE.test(prefixed[1])) {
      const owner = resolveOwner(prefixed[1])
      if (owner) {
        if (state.current?.team !== owner.name) {
          closeLineup()
          pendingTeams.unshift(owner.name)
          startLineupIfNeeded()
        }
        line = prefixed[2].trim()
      }
    }

    // Week header
    const weekMatch = line.match(/^week\s*#?\s*(\d+)\b/i)
    if (weekMatch) {
      const wk = parseInt(weekMatch[1])
      if (result.week && result.week !== wk) {
        result.issues.push(`Text says week ${wk}, expected week ${result.week}`)
      }
      result.week = wk
      continue
    }

    // Matchup header: "Chuy vs Larry"
    const vsMatch = line.match(/^(.+?)\s+vs\.?\s+(.+?)\s*$/i)
    if (vsMatch) {
      const a = resolveOwner(vsMatch[1])
      const b = resolveOwner(vsMatch[2])
      if (a && b) {
        closeLineup()
        pendingTeams.push(a.name, b.name)
        continue
      }
    }

    // Single team-name header line
    const soloOwner = resolveOwner(line.replace(/[:\-–—]+$/, ''))
    if (soloOwner && !POSITION_RE.test(line)) {
      closeLineup()
      pendingTeams.unshift(soloOwner.name)
      // fall through: this line only names the team
      startLineupIfNeeded()
      continue
    }

    // Total line: "Total: 101pts" or a bare "101"
    const totalMatch = line.match(/^total\b[\s.:\-–—]*(-?\d+(?:\.\d+)?)\s*(?:pts?\.?)?$/i) ?? line.match(/^(-?\d+(?:\.\d+)?)\s*(?:pts?\.?)?$/)
    if (totalMatch && state.current && !ctx.lineupOnly) {
      state.current.statedTotal = parseFloat(totalMatch[1])
      closeLineup()
      continue
    }

    // Player slot line
    const posMatch = line.match(POSITION_RE)
    if (posMatch) {
      const pos = canonPosition(posMatch[1])
      // Lineup submissions carry no scores — "Flex: Josh Jacobs" is the whole line
      const extracted = ctx.lineupOnly
        ? nameOnly(posMatch[3])
        : extractScore(posMatch[3])
      if (!extracted) {
        if (state.current) {
          state.current.issues.push(
            ctx.lineupOnly ? `No player name on: "${line}"` : `Couldn't read a score from: "${line}"`,
          )
        }
        continue
      }
      const order = SLOT_ORDER[pos]
      if (!order) continue

      startLineupIfNeeded()
      // "RB2:" / "Flex 2:" pins the slot — essential for partials, where a lone
      // second back must not land in RB1. Otherwise take the first free slot.
      const explicit = posMatch[2] ? order[parseInt(posMatch[2]) - 1] : undefined
      let slot = explicit ?? order.find((s) => !usedSlots.has(s))
      if (!slot || usedSlots.has(slot)) {
        // A repeated position signals the next lineup started without a total line
        closeLineup()
        startLineupIfNeeded()
        slot = explicit ?? order[0]
      }
      usedSlots.add(slot)
      state.current!.players.push({
        slot,
        rawName: extracted.name,
        name: extracted.name,
        score: extracted.score,
        ambiguousSign: extracted.ambiguousSign,
        confidence: 0,
        alternates: [],
        issues: [],
      })
      continue
    }
  }
  closeLineup()
  if (ctx.lineupOnly && pendingTeams.length > 0) {
    result.issues.push(
      `${pendingTeams.join(' and ')} named but no players found — put each manager's lines under their own name`,
    )
  }

  function startLineupIfNeeded() {
    if (state.current) return
    state.current = {
      team: pendingTeams.shift(),
      teamSource: 'unknown',
      players: [],
      statedTotal: undefined,
      computedTotal: 0,
      issues: [],
    }
    if (state.current.team) state.current.teamSource = 'header'
    usedSlots.clear()
  }

  if (result.lineups.length === 0) {
    result.issues.push(
      ctx.lineupOnly
        ? 'No lineups found — expected lines like "QB: Josh Allen"'
        : 'No lineups found — expected lines like "QB. Josh Allen: 30pts"',
    )
  }
  if (result.week === undefined) {
    result.issues.push('No week number found — add a "Week N" line or set it manually')
  }
  return result
}

/**
 * Matchup winner per constitution §IX: total, then RB1, WR1, QB tiebreakers.
 */
export function decideWinner(
  a: { team: string; total: number; slotScore: (slot: Slot) => number },
  b: { team: string; total: number; slotScore: (slot: Slot) => number },
): { winner: string; loser: string; tiebreaker?: Slot } {
  if (a.total !== b.total) {
    return a.total > b.total ? { winner: a.team, loser: b.team } : { winner: b.team, loser: a.team }
  }
  for (const slot of ['RB1', 'WR1', 'QB'] as Slot[]) {
    const sa = a.slotScore(slot)
    const sb = b.slotScore(slot)
    if (sa !== sb) {
      return sa > sb
        ? { winner: a.team, loser: b.team, tiebreaker: slot }
        : { winner: b.team, loser: a.team, tiebreaker: slot }
    }
  }
  return { winner: a.team, loser: b.team, tiebreaker: 'QB' }
}
