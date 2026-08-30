import { Metadata } from 'next'
import { CONSTITUTION, SCORING_TABLES } from '@/lib/rules'
import { LEAGUE } from '@/lib/league'

export const metadata: Metadata = { title: 'Rules & Scoring' }

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Constitution & Scoring</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {LEAGUE.name} · since {LEAGUE.since}. All stats based on ESPN.com.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Scoring</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCORING_TABLES.map((table) => (
            <div key={table.title} className="rounded-xl border bg-card shadow-sm">
              <div className="border-b px-4 py-2.5">
                <h3 className="font-semibold">{table.title}</h3>
                {table.note && <p className="mt-0.5 text-xs text-muted-foreground">{table.note}</p>}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.label} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-1.5 text-muted-foreground">{row.label}</td>
                      <td
                        className={`tabular px-4 py-1.5 text-right font-semibold ${
                          row.points.startsWith('-') ? 'text-loss' : ''
                        }`}
                      >
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">The Constitution</h2>
        <div className="space-y-3">
          {CONSTITUTION.map((section) => (
            <details key={section.numeral} className="group rounded-xl border bg-card shadow-sm" open>
              <summary className="cursor-pointer select-none list-none px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                <span className="mr-2 text-muted-foreground">{section.numeral}.</span>
                {section.title}
              </summary>
              <div className="space-y-2 border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
