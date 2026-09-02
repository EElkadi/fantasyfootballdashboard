import { ReactNode } from 'react'
import { PoolPlayer } from '@/lib/types'
import { positionColor, POSITION_ORDER } from '@/lib/players'

/**
 * Pool players grouped by position — the shape bestAvailable() and
 * freeAgents() return. Known positions in the usual order, then an "Other"
 * bucket so a row with an odd position string is still visible.
 */
export function PositionLists({
  groups,
  limit = Infinity,
  item,
  className = '',
}: {
  groups: Record<string, PoolPlayer[]>
  limit?: number
  item: (p: PoolPlayer) => ReactNode
  className?: string
}) {
  const positions = [...POSITION_ORDER.filter((pos) => groups[pos]?.length), ...Object.keys(groups).filter((k) => !POSITION_ORDER.includes(k) && groups[k].length)]
  return (
    <div className={className}>
      {positions.map((pos) => (
        <div key={pos}>
          <p className="mb-1 text-xs font-bold" style={{ color: positionColor(pos) }}>
            {pos === '?' ? 'Other' : pos}
            {groups[pos].length > limit ? ` · ${groups[pos].length}` : ''}
          </p>
          <ol className="space-y-0.5 text-sm">
            {groups[pos].slice(0, limit).map((p) => (
              <li key={p.rank} className="flex items-baseline gap-2">
                {item(p)}
                <span className="tabular ml-auto shrink-0 text-xs text-muted-foreground">#{p.rank}</span>
              </li>
            ))}
            {groups[pos].length > limit && (
              <li className="text-xs text-muted-foreground">+{groups[pos].length - limit} more</li>
            )}
          </ol>
        </div>
      ))}
    </div>
  )
}
