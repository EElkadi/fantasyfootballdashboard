'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ownerColor } from '@/lib/league'

export interface SeriesPoint {
  week: number
  [team: string]: number
}

/**
 * Weekly score line chart for one or more teams. `leagueAvg` draws a dashed
 * reference series when provided.
 */
export function ScoresChart({
  data,
  teams,
  leagueAvg,
  height = 280,
  seriesColors,
}: {
  data: SeriesPoint[]
  teams: string[]
  leagueAvg?: Record<number, number>
  height?: number
  /** Override the per-series color (defaults to the owner's team color) */
  seriesColors?: Record<string, string>
}) {
  const merged = data.map((d) => ({
    ...d,
    ...(leagueAvg ? { 'League avg': Math.round((leagueAvg[d.week] ?? 0) * 10) / 10 } : {}),
  }))

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="week"
            tickFormatter={(w) => `W${w}`}
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
          />
          <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" width={52} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              color: 'hsl(var(--popover-foreground))',
              fontSize: 13,
            }}
            labelFormatter={(w) => `Week ${w}`}
          />
          {leagueAvg && (
            <Line
              type="monotone"
              dataKey="League avg"
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {teams.map((team) => (
            <Line
              key={team}
              type="monotone"
              dataKey={team}
              stroke={seriesColors?.[team] ?? ownerColor(team)}
              strokeWidth={2.25}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
