/**
 * A manager's personal draft rankings: the league's Player Pool in the order
 * they choose, kept in their own browser. Shared client/server-safe helpers.
 */

import { DraftPick, PoolPlayer } from '@/lib/types'
import { LEAGUE } from '@/lib/league'
import { parseDraftCell } from '@/lib/data/transform'
import { matchName } from '@/lib/parser/match'
import { PlayerRef, formatPoolPlayer, poolIndex, playerSlug, samePlayer } from '@/lib/players'

/** Stable id for a pool row — name plus team, so two Mike Williamses stay apart */
export function poolKey(p: PlayerRef): string {
  return `${playerSlug(p.player)}|${p.nflTeam ?? ''}`
}

export interface BoardEntry {
  /** 1-based position on the manager's list (tier headers don't count) */
  rank: number
  /** The line as typed */
  raw: string
  /** Tier header this entry sits under, if any */
  tier?: string
  /** Display name — the pool's spelling when matched, else as typed */
  name: string
  nflTeam?: string
  position?: string
  /** Set when the line resolved to a pool player (needed for auto cross-out) */
  match?: PoolPlayer
}

const TIER_RE = /^(?:#+\s*(.+)|tier\b\s*(.*)|-{3,}\s*(.*)|={3,}\s*(.*))$/i
const NUMBERING_RE = /^\s*\(?\d{1,3}[.):\-–—]?\)?\s+/

/**
 * Parse a pasted rankings list. Numbering is optional ("1. Bijan", "12) Puka",
 * or just names); lines like "# RBs", "Tier 2" or "---" start a tier. Names
 * resolve against the Player Pool (exact first, then fuzzy) so a spelling
 * that isn't quite the sheet's still crosses out.
 */
export function parseRankings(text: string, pool: PoolPlayer[]): BoardEntry[] {
  const index = poolIndex(pool)
  const poolNames = pool.map((p) => p.player)
  const entries: BoardEntry[] = []
  let tier: string | undefined
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const tierMatch = line.match(TIER_RE)
    if (tierMatch) {
      tier = (tierMatch[1] ?? tierMatch[2] ?? tierMatch[3] ?? tierMatch[4] ?? '').trim() || `Tier ${entries.length ? '↓' : '1'}`
      continue
    }
    const body = line.replace(NUMBERING_RE, '').trim()
    if (!body) continue
    const parsed = parseDraftCell(body)
    let match = index.get(playerSlug(parsed.player))
    // Two pool players with one name: prefer the one whose team was typed
    if (match && parsed.nflTeam) {
      const exact = pool.find((p) => samePlayer(p, parsed) && p.nflTeam === parsed.nflTeam)
      if (exact) match = exact
    }
    if (!match && poolNames.length > 0) {
      const fuzzy = matchName(parsed.player, poolNames)
      if (fuzzy && fuzzy.confidence >= 0.6 && fuzzy.ambiguous.length === 0) match = index.get(playerSlug(fuzzy.player))
    }
    entries.push({
      rank: entries.length + 1,
      raw: line,
      tier,
      name: match?.player ?? parsed.player,
      nflTeam: parsed.nflTeam ?? match?.nflTeam,
      position: parsed.position ?? match?.position,
      match,
    })
  }
  return entries
}

/** Who drafted this entry, if anyone. */
export function draftedBy(entry: BoardEntry, picks: DraftPick[]): DraftPick | undefined {
  const ref: PlayerRef = entry.match ? { player: entry.match.player, nflTeam: entry.match.nflTeam } : { player: entry.name, nflTeam: entry.nflTeam }
  return picks.find((p) => samePlayer(p, ref))
}

/** A starting point: the league's pool, in its order, as editable text. */
export function seedFromPool(pool: PoolPlayer[]): string {
  return pool.map((p, i) => `${i + 1}. ${formatPoolPlayer(p)}`).join('\n')
}

/**
 * Bring a saved order in line with today's pool: drop keys the pool no longer
 * has, append pool players the order has never seen (in pool order), and
 * dedupe. The result is always a permutation of the pool.
 */
export function reconcileOrder(order: string[], pool: PoolPlayer[]): string[] {
  const valid = new Set(pool.map(poolKey))
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of order) {
    if (valid.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  for (const p of pool) {
    const key = poolKey(p)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

/** Move `activeKey` to where `overKey` sits (dragging within a filtered view still works on the full list). */
export function moveKey(order: string[], activeKey: string, overKey: string): string[] {
  if (activeKey === overKey) return order
  const from = order.indexOf(activeKey)
  const to = order.indexOf(overKey)
  if (from < 0 || to < 0) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, activeKey)
  return next
}

/**
 * Pasted rankings become the top of the order (in pasted order); everyone
 * not mentioned keeps their current relative order below. Lines that don't
 * resolve to a pool player are reported back rather than silently dropped.
 */
export function applyTextImport(order: string[], text: string, pool: PoolPlayer[]): { order: string[]; unmatched: string[] } {
  const entries = parseRankings(text, pool)
  const top: string[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (!e.match) {
      unmatched.push(e.raw)
      continue
    }
    const key = poolKey(e.match)
    if (!seen.has(key)) {
      seen.add(key)
      top.push(key)
    }
  }
  return { order: reconcileOrder([...top, ...order], pool), unmatched }
}

/** Numbered text for copying between devices; round-trips through applyTextImport. */
export function orderToText(order: string[], pool: PoolPlayer[]): string {
  const byKey = new Map(pool.map((p) => [poolKey(p), p]))
  return order
    .map((key, i) => {
      const p = byKey.get(key)
      return p ? `${i + 1}. ${formatPoolPlayer(p)}` : null
    })
    .filter(Boolean)
    .join('\n')
}

export interface RequirementRow {
  position: string
  have: number
  need: number
}

export interface RosterProgress {
  rows: RequirementRow[]
  /** Picks made so far */
  picked: number
  /** Picks still to come */
  remaining: number
  /** Minimum slots still unfilled across all positions */
  stillNeeded: number
  /** Picks the manager can spend however they like (negative = can't meet the minimums) */
  free: number
  /** Picks whose position the site couldn't tell — counted as picked, not toward any minimum */
  unknown: number
}

/** TE fills a WR requirement; D/ST spellings collapse to DEF. */
function requirementBucket(position?: string): string | undefined {
  if (!position) return undefined
  const pos = position.toUpperCase().replace('D/ST', 'DEF').replace('DST', 'DEF')
  if (pos === 'TE') return 'WR'
  return pos in LEAGUE.rosterMinimums ? pos : undefined
}

/** Where one team stands against the roster minimums, given their picks so far. */
export function rosterProgress(picks: DraftPick[], rounds: number = LEAGUE.draftRounds): RosterProgress {
  const counts: Record<string, number> = {}
  let unknown = 0
  for (const p of picks) {
    const bucket = requirementBucket(p.position)
    if (bucket) counts[bucket] = (counts[bucket] ?? 0) + 1
    else unknown++
  }
  const rows = Object.entries(LEAGUE.rosterMinimums).map(([position, need]) => ({
    position,
    have: counts[position] ?? 0,
    need,
  }))
  const stillNeeded = rows.reduce((s, r) => s + Math.max(0, r.need - r.have), 0)
  const remaining = Math.max(0, rounds - picks.length)
  return { rows, picked: picks.length, remaining, stillNeeded, free: remaining - stillNeeded, unknown }
}
