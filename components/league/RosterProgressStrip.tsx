'use client'

import { positionColor } from '@/lib/players'
import { RosterProgress } from '@/lib/draftBoard'

/**
 * How a team is doing against the draft minimums: one chip per position,
 * green once met, plus how many free picks are left after the minimums.
 */
export function RosterProgressStrip({ progress, compact = false }: { progress: RosterProgress; compact?: boolean }) {
  const short = progress.free < 0
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      {progress.rows.map((r) => {
        const met = r.have >= r.need
        return (
          <span
            key={r.position}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 tabular ${
              met ? 'border-[hsl(var(--win))]/40 bg-[hsl(var(--win))]/10' : 'bg-card'
            }`}
            title={`${r.position}${r.position === 'WR' ? ' (TE counts)' : ''}: ${r.have} of ${r.need} required`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: positionColor(r.position) }} />
            <span className="font-semibold">{r.position}</span>
            <span className={met ? 'text-win' : 'text-muted-foreground'}>
              {r.have}/{r.need}
              {met ? ' ✓' : ''}
            </span>
          </span>
        )
      })}
      <span
        className={`ml-auto rounded-md px-2 py-0.5 font-medium ${
          short ? 'bg-[hsl(var(--loss))]/10 text-loss' : 'bg-secondary text-muted-foreground'
        }`}
        title="Picks left minus minimums still unfilled"
      >
        {short
          ? `${-progress.free} short — ${progress.stillNeeded} required slots, ${progress.remaining} picks left`
          : `${progress.free} free pick${progress.free === 1 ? '' : 's'} · ${progress.remaining} left`}
      </span>
      {progress.unknown > 0 && (
        <span className="text-xs text-muted-foreground" title="Position unknown — add the position to the pick to count it">
          {progress.unknown} unplaced
        </span>
      )}
    </div>
  )
}
