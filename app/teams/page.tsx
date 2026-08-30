import Link from 'next/link'
import { Metadata } from 'next'
import { getDefaultSeason } from '@/lib/data'
import { OWNERS, ownerColor, teamNameOf } from '@/lib/league'

export const revalidate = 60
export const metadata: Metadata = { title: 'Teams' }

export default async function TeamsPage() {
  const season = await getDefaultSeason()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">All twelve franchises.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OWNERS.map((o) => {
          const s = season.standings.find((x) => x.team === o.name)
          return (
            <Link
              key={o.name}
              href={`/teams/${o.name.toLowerCase()}`}
              className="group rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-extrabold text-white"
                  style={{ backgroundColor: ownerColor(o.name) }}
                >
                  {o.name[0]}
                </span>
                <div className="min-w-0">
                  <p className="font-bold group-hover:underline">{teamNameOf(o.name)}</p>
                  <p className="truncate text-sm text-muted-foreground">{o.name}</p>
                </div>
              </div>
              {s && (
                <div className="mt-3 flex gap-4 text-sm">
                  <span>
                    <span className="tabular font-semibold">
                      {s.overall.wins}-{s.overall.losses}
                    </span>{' '}
                    <span className="text-muted-foreground">({season.season})</span>
                  </span>
                  <span className="text-muted-foreground">#{s.rank}</span>
                  <span className="text-muted-foreground">{s.avgPointsFor.toFixed(1)} ppg</span>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
