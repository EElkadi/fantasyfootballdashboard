import Link from 'next/link'

/** Season pills. Renders nothing when there is only one season to show. */
export function SeasonTabs({
  seasons,
  current,
  href,
}: {
  seasons: number[]
  current: number
  href: (season: number) => string
}) {
  if (seasons.length < 2) return null
  return (
    <nav aria-label="Season" className="flex gap-1.5 text-sm">
      {seasons.map((s) => (
        <Link
          key={s}
          href={href(s)}
          aria-current={s === current ? 'page' : undefined}
          className={`tabular rounded-md px-2.5 py-1 font-medium transition-colors ${
            s === current ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {s}
        </Link>
      ))}
    </nav>
  )
}
