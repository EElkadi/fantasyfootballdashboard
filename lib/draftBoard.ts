/**
 * A manager's personal draft rankings: plain text, one player per line, kept
 * in their own browser. Shared client/server-safe helpers.
 */

import { DraftPick, PoolPlayer } from '@/lib/types'
import { parseDraftCell } from '@/lib/data/transform'
import { matchName } from '@/lib/parser/match'
import { PlayerRef, formatPoolPlayer, poolIndex, playerSlug, samePlayer } from '@/lib/players'

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
