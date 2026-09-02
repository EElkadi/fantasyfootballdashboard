/** Player identity, URL slugs, position styling and pool search — shared client/server. */

import { PoolPlayer } from '@/lib/types'
import { parseDraftCell } from '@/lib/data/transform'

export function playerSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Classic fantasy-board position colors; readable with white text in both themes. */
export const POSITION_COLORS: Record<string, string> = {
  QB: '#dc2626',
  RB: '#0d9488',
  WR: '#2563eb',
  TE: '#d97706',
  K: '#7c3aed',
  DEF: '#57534e',
}

export function positionColor(position?: string): string {
  return POSITION_COLORS[(position ?? '').toUpperCase()] ?? '#6b7280'
}

export const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** The minimum needed to tell two players apart */
export interface PlayerRef {
  player: string
  nflTeam?: string
}

/** Roster / board cell text -> PlayerRef ("Bijan Robinson ATL RB" → Bijan Robinson, ATL) */
export function cellRef(cell: string): PlayerRef {
  const parsed = parseDraftCell(cell)
  return { player: parsed.player, nflTeam: parsed.nflTeam }
}

/** Same person: same name, and NFL teams agree whenever both sides carry one. */
export function samePlayer(a: PlayerRef, b: PlayerRef): boolean {
  if (playerSlug(a.player) !== playerSlug(b.player)) return false
  return !a.nflTeam || !b.nflTeam || a.nflTeam === b.nflTeam
}

/** Names that appear more than once in the pool (two Mike Williamses) */
export function ambiguousNames(pool: PoolPlayer[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const p of pool) {
    const slug = playerSlug(p.player)
    if (seen.has(slug)) dupes.add(slug)
    seen.add(slug)
  }
  return dupes
}

/**
 * Set key for a player: the name slug, plus the NFL team only when the pool
 * has two players of that name — so a bare "Josh Allen" on a roster still
 * matches, but the two Mike Williamses stay distinct.
 */
export function playerKey(ref: PlayerRef, ambiguous: Set<string>): string {
  const slug = playerSlug(ref.player)
  return ambiguous.has(slug) && ref.nflTeam ? `${slug}|${ref.nflTeam}` : slug
}

/** Keys for everyone already taken, ready for bestAvailable / searchPool. */
export function takenKeys(pool: PoolPlayer[], refs: PlayerRef[]): Set<string> {
  const ambiguous = ambiguousNames(pool)
  return new Set(refs.map((r) => playerKey(r, ambiguous)))
}

/** slug -> pool row, for enrichment lookups */
export function poolIndex(pool: PoolPlayer[]): Map<string, PoolPlayer> {
  const index = new Map<string, PoolPlayer>()
  for (const p of pool) if (!index.has(playerSlug(p.player))) index.set(playerSlug(p.player), p)
  return index
}

/**
 * The draft-cell form the sheet parsers read back: "Jahmyr Gibbs DET RB".
 * Only a 2–3 letter team code survives — parseDraftCell treats anything else
 * as part of the name, which would break every identity comparison after.
 */
export function formatPoolPlayer(p: PoolPlayer): string {
  const team = p.nflTeam && /^[A-Z]{2,3}$/.test(p.nflTeam) ? p.nflTeam : undefined
  return [p.player, team, p.position].filter(Boolean).join(' ')
}

/** Fill in position / NFL team from the pool when the source cell lacked them. */
export function enrichFromPool<T extends { player: string; nflTeam?: string; position?: string }>(
  item: T,
  index: Map<string, PoolPlayer>,
): T {
  if (item.position && item.nflTeam) return item
  const hit = index.get(playerSlug(item.player))
  if (!hit) return item
  return { ...item, position: item.position ?? hit.position, nflTeam: item.nflTeam ?? hit.nflTeam }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()

/**
 * Typeahead over the pool: every query token must start some name token
 * ("j gib" → Jahmyr Gibbs; "gibbs" works too). Exact-prefix matches first,
 * then pool order. `exclude` drops already-drafted slugs.
 */
export function searchPool(pool: PoolPlayer[], query: string, limit = 8, exclude?: Set<string>): PoolPlayer[] {
  const q = fold(query)
  if (!q) return []
  const qTokens = q.split(/\s+/)
  const ambiguous = ambiguousNames(pool)
  const scored: { p: PoolPlayer; score: number }[] = []
  for (const p of pool) {
    if (exclude?.has(playerKey(p, ambiguous))) continue
    const name = fold(p.player)
    const tokens = name.split(/\s+/)
    const ok = qTokens.every((t) => tokens.some((n) => n.startsWith(t)) || name.includes(t))
    if (!ok) continue
    scored.push({ p, score: name.startsWith(q) ? 0 : tokens.some((n) => n.startsWith(qTokens[0])) ? 1 : 2 })
  }
  return scored.sort((a, b) => a.score - b.score || a.p.rank - b.p.rank).slice(0, limit).map((x) => x.p)
}

/**
 * Undrafted / unrostered pool players grouped by position, pool order kept.
 * `taken` comes from takenKeys(). Unknown positions land under "?" so nobody
 * silently vanishes.
 */
export function bestAvailable(
  pool: PoolPlayer[],
  taken: Set<string>,
  perPosition = Infinity,
): Record<string, PoolPlayer[]> {
  const ambiguous = ambiguousNames(pool)
  const out: Record<string, PoolPlayer[]> = {}
  for (const p of pool) {
    if (taken.has(playerKey(p, ambiguous))) continue
    const pos = p.position && POSITION_ORDER.includes(p.position) ? p.position : '?'
    out[pos] ??= []
    if (out[pos].length < perPosition) out[pos].push(p)
  }
  return out
}
