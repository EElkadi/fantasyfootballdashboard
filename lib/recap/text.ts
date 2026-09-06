import { Award, AWARD_META } from '@/lib/data/awards'
import { DraftGrade, DraftPick } from '@/lib/types'

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

/** Draft grades for the group chat: sorted best to worst, one block per team. */
export function draftGradesText(season: number, grades: DraftGrade[], picks: DraftPick[], teamNames: Record<string, string> = {}): string {
  const roundOf = (team: string, player: string) => picks.find((p) => p.team === team && p.player === player)?.round
  const withRound = (team: string, player: string) => {
    const r = roundOf(team, player)
    return r ? `${player} (R${r})` : player
  }
  const sorted = [...grades].sort((a, b) => b.grade - a.grade || a.team.localeCompare(b.team))
  const lines = [`🏈 *PLFF ${season} Draft Grades*`, '']
  sorted.forEach((g, i) => {
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : i === sorted.length - 1 && sorted.length > 3 ? '💩 ' : ''
    const name = teamNames[g.team] ? ` (${teamNames[g.team]})` : ''
    lines.push(`${medal}*${g.team}*${name} — ${formatGrade(g.grade)}/10`)
    if (g.bestPick) lines.push(`  ✅ Best: ${withRound(g.team, g.bestPick)}`)
    if (g.worstPick) lines.push(`  ❌ Worst: ${withRound(g.team, g.worstPick)}`)
    if (g.notes) lines.push(`  _${g.notes}_`)
    lines.push('')
  })
  const avg = sorted.length ? sorted.reduce((s, g) => s + g.grade, 0) / sorted.length : 0
  if (sorted.length) lines.push(`League average: ${formatGrade(avg)}/10`)
  return lines.join('\n').trimEnd()
}

/** 7 -> "7", 7.4 -> "7.4", 7.25 -> "7.3" */
export function formatGrade(g: number): string {
  const rounded = Math.round(g * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
