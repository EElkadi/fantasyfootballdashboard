import Link from 'next/link'
import { Metadata } from 'next'
import { getDefaultSeason } from '@/lib/data'
import { ACTIVE_OWNERS, OWNERS, ownerColor, teamNameOf } from '@/lib/league'
import { PageHeader } from '@/components/league/PageHeader'

// Rendered per request from the 60-second data cache — never a build-time snapshot
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Teams' }

export default async function TeamsPage() {
  const season = await getDefaultSeason()

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeader title="Teams" description="All twelve franchises." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIVE_OWNERS.map((o) => {
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
                  <p className="font-bold group-hover:underline">{teamNameOf(o.name, season.teamNames)}</p>
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

      {OWNERS.some((o) => o.active === false) && (
        <div className="text-sm text-muted-foreground">
          Former franchises:{' '}
          {OWNERS.filter((o) => o.active === false).map((o, i, arr) => (
            <span key={o.name}>
              <Link href={`/teams/${o.name.toLowerCase()}`} className="font-medium text-foreground hover:underline">
                {teamNameOf(o.name)} ({o.name})
              </Link>
              {i < arr.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
