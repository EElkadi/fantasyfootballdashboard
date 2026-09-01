import { Award, AWARD_META } from '@/lib/data/awards'

/**
 * Plain-text weekly recap for the league chat. WhatsApp renders *bold* and
 * _italic_, nothing else, so the format is deliberately simple. Pure
 * function — see tests/recap.test.ts.
 */

export interface RecapTextInput {
  season: number
  week: number
  weekLabel?: string
  regularSeasonWeeks: number
  playoffTeams: number
  results: { winner: string; loser: string; winScore: number; loseScore: number; tiebreaker?: boolean }[]
  awards: Award[]
  mvp?: { player: string; team: string; score: number; slot: string }
  /** Standings after this week; omitted for playoff weeks */
  standings?: { team: string; record: string }[]
  nextWeek?: { week: number; label?: string; pairs: [string, string][] }
  /** Absolute link to the week's box scores */
  url?: string
}

export function recapText(input: RecapTextInput): string {
  const lines: string[] = []
  const title = input.week > input.regularSeasonWeeks ? input.weekLabel ?? `Week ${input.week}` : `Week ${input.week}`
  lines.push(`🏈 *PLFF ${input.season} · ${title} Recap*`)
  if (input.week <= input.regularSeasonWeeks && input.weekLabel) lines.push(`_${input.weekLabel}_`)
  lines.push('')

  lines.push('*Results*')
  for (const r of input.results) {
    const tb = r.tiebreaker ? ' (tiebreaker)' : ''
    lines.push(`${r.winner} ${r.winScore} – ${r.loseScore} ${r.loser}${tb}`)
  }
  lines.push('')

  if (input.awards.length > 0 || input.mvp) {
    lines.push('*Awards*')
    for (const a of input.awards) {
      const meta = AWARD_META[a.key]
      lines.push(`${meta.emoji} ${meta.name}: ${a.team} — ${a.detail}`)
    }
    if (input.mvp) {
      lines.push(`⭐ MVP: ${input.mvp.player} (${input.mvp.slot}, ${input.mvp.team}) — ${input.mvp.score} pts`)
    }
    lines.push('')
  }

  if (input.standings && input.standings.length > 0) {
    lines.push(`*Standings* (top ${input.playoffTeams} in)`)
    input.standings.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.team} ${s.record}`)
      if (i === input.playoffTeams - 1 && i < input.standings!.length - 1) lines.push('———')
    })
    lines.push('')
  }

  if (input.nextWeek && input.nextWeek.pairs.length > 0) {
    lines.push(`*Up next — Week ${input.nextWeek.week}${input.nextWeek.label ? ` · ${input.nextWeek.label}` : ''}*`)
    for (const [a, b] of input.nextWeek.pairs) lines.push(`${a} vs ${b}`)
    lines.push('')
  }

  if (input.url) lines.push(input.url)
  return lines.join('\n').trimEnd()
}
