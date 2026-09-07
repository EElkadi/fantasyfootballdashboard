import Link from 'next/link'

/**
 * Week picker. Played weeks are solid, the selected week is filled, and weeks
 * still to come are dashed outlines.
 */
export function WeekNav({
  weeks,
  current,
  latest,
  href,
}: {
  weeks: Iterable<number>
  current: number
  /** last week with scores */
  latest: number
  href: (week: number) => string
}) {
  const sorted = Array.from(new Set(weeks)).sort((a, b) => a - b)
  return (
    <nav aria-label="Week" className="flex flex-wrap gap-1.5">
      {sorted.map((w) => (
        <Link
          key={w}
          href={href(w)}
          aria-current={w === current ? 'page' : undefined}
          className={`tabular rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
            w === current
              ? 'bg-primary text-primary-foreground'
              : w <= latest
                ? 'bg-secondary text-foreground hover:bg-secondary/70'
                : 'border border-dashed text-muted-foreground hover:bg-secondary/50'
          }`}
        >
          {w}
        </Link>
      ))}
    </nav>
  )
}
