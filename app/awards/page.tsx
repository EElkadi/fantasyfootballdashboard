import Link from 'next/link'
import { Metadata } from 'next'
import { getDefaultSeason } from '@/lib/data'
import { AWARD_KEYS, AWARD_META, seasonAwards, tallyAwards } from '@/lib/data/awards'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60
export const metadata: Metadata = { title: 'Awards' }

export default async function AwardsPage() {
  const season = await getDefaultSeason()
  const awards = seasonAwards(season)
  const tally = tallyAwards(awards, season.teams)
  const weeks = [...season.weeks].reverse()

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Weekly Awards · {season.season}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Handed out automatically from the box scores every week. Nobody votes; nobody is safe.
        </p>
      </div>

      {awards.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Awards start flowing once Week 1 scores are in.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">Trophy count</h2>
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Team</th>
                    {AWARD_KEYS.map((k) => (
                      <th key={k} className="px-2 py-2.5 text-center font-medium" title={AWARD_META[k].blurb}>
                        <span aria-hidden>{AWARD_META[k].emoji}</span>
                        <span className="sr-only">{AWARD_META[k].name}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {tally.map((t) => (
                    <tr key={t.team} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">
                        <TeamMark team={t.team} />
                      </td>
                      {AWARD_KEYS.map((k) => (
                        <td key={k} className="tabular px-2 py-2 text-center">
                          {t.counts[k] > 0 ? t.counts[k] : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      ))}
                      <td className="tabular px-3 py-2 text-right font-semibold">{t.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {AWARD_KEYS.map((k) => (
                <li key={k}>
                  <span aria-hidden>{AWARD_META[k].emoji}</span> <span className="font-medium">{AWARD_META[k].name}</span> —{' '}
                  {AWARD_META[k].blurb.toLowerCase()}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">Week by week</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {weeks.map((week) => {
                const list = awards.filter((a) => a.week === week)
                const label = season.schedule.find((s) => s.week === week)?.label
                return (
                  <div key={week} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-semibold">
                        Week {week}
                        {label ? <span className="text-muted-foreground"> · {label}</span> : null}
                      </h3>
                      <Link
                        href={`/matchups?week=${week}&season=${season.season}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Box scores →
                      </Link>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {list.map((a) => (
                        <li key={a.key} className="flex items-baseline gap-2">
                          <span aria-hidden className="w-5 shrink-0">
                            {AWARD_META[a.key].emoji}
                          </span>
                          <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {AWARD_META[a.key].name}
                          </span>
                          <TeamMark team={a.team} className="shrink-0" />
                          <span className="min-w-0 truncate text-muted-foreground">{a.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
