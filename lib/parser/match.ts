/**
 * Fuzzy player-name matching against team rosters.
 * Pure TypeScript — runs on both server and client.
 */

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !SUFFIXES.has(t))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

function tokensClose(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(b) || b.startsWith(a)) return true
    return levenshtein(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 4))
  }
  return false
}

export interface MatchResult {
  /** Canonical player display name from the roster */
  player: string
  /** 0–1 */
  confidence: number
  /** Other roster players that matched about as well */
  ambiguous: string[]
}

/**
 * Match a raw chat name ("Mathew Stafford", "Romeo", "Kenneth Walker III")
 * against candidate names. Candidates should be plain display names.
 */
export function matchName(raw: string, candidates: string[]): MatchResult | null {
  const rawToks = tokens(raw)
  if (rawToks.length === 0 || candidates.length === 0) return null

  const scored = candidates.map((cand) => {
    const candToks = tokens(cand)
    const rawJoined = rawToks.join(' ')
    const candJoined = candToks.join(' ')

    if (rawJoined === candJoined) return { cand, score: 1 }

    // Every raw token closely matches some candidate token, in order
    let ci = 0
    let hits = 0
    for (const rt of rawToks) {
      let found = -1
      for (let j = ci; j < candToks.length; j++) {
        if (tokensClose(rt, candToks[j])) {
          found = j
          break
        }
      }
      if (found >= 0) {
        hits++
        ci = found + 1
      }
    }
    if (hits === rawToks.length) {
      // Full coverage of what was typed; more coverage of the real name = better
      const coverage = hits / candToks.length
      const exactness = rawJoined === candJoined ? 1 : 0.9
      return { cand, score: Math.min(0.98, 0.55 + 0.4 * coverage) * exactness }
    }

    // Whole-string edit distance for typo-heavy input
    const dist = levenshtein(rawJoined, candJoined)
    if (dist <= 3 && rawJoined.length >= 8) return { cand, score: 0.8 - dist * 0.08 }

    // Partial: most raw tokens hit
    if (rawToks.length >= 2 && hits >= rawToks.length - 1) return { cand, score: 0.55 }

    return { cand, score: 0 }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 0.5) return null
  const ambiguous = scored.slice(1).filter((s) => s.score >= best.score - 0.1 && s.score >= 0.5).map((s) => s.cand)
  return { player: best.cand, confidence: ambiguous.length > 0 ? Math.min(best.score, 0.6) : best.score, ambiguous }
}

/** Strip "BUF", "(QB)" style suffixes from roster entries to a display name. */
export function rosterDisplayName(entry: string): string {
  return entry
    .replace(/\(([^)]*)\)\s*$/, '')
    .trim()
    .replace(/\s+(?:[A-Z]{2,3}|D\/ST|DST|FA)(?:\s+(?:QB|RB|WR|TE|K|DEF|D\/ST|DST))?$/, '')
    .trim()
}
