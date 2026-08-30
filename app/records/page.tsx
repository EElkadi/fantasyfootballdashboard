import { Metadata } from 'next'
import { getAllSeasons } from '@/lib/data'
import { buildRecordBook, RecordEntry } from '@/lib/data/records'
import Link from 'next/link'
import { HONORS, resolveOwner } from '@/lib/league'
import { playerSlug } from '@/lib/players'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 300
export const metadata: Metadata = { title: 'Records' }

export default async function RecordsPage() {
  const seasons = await getAllSeasons()
  const book = buildRecordBook(seasons)
  const years = seasons.map((s) => s.season)
  const span =
    years.length === 0 ? '' : years.length === 1 ? `${years[0]}` : `${Math.min(...years)}–${Math.max(...years)}`

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Record Book</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every number below comes from the actual box scores{span ? ` (${span})` : ''}. History grows as more
          seasons are archived.
        </p>
      </div>

      {HONORS.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Champions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HONORS.map((h) => (
              <div key={h.season} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{h.season}</p>
                {h.champion && <p className="mt-1 text-lg font-bold">🏆 {h.champion}</p>}
                {h.turd && <p className="text-sm text-muted-foreground">💩 Turd: {h.turd}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <RecordSection title="Game records" entries={book.games} />
      <RecordSection title="Player performances" entries={book.players} />
      <RecordSection title="Streaks" entries={book.streaks} />
      <RecordSection title="Season bests" entries={book.seasons} />

      {seasons.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          The record book fills in once there are scores on the books.
        </p>
      )}
    </div>
  )
}

function RecordSection({ title, entries }: { title: string; entries: RecordEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.label}</p>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              {resolveOwner(e.holder) ? (
                <TeamMark team={e.holder} className="min-w-0 truncate" />
              ) : e.kind === 'player' ? (
                <Link
                  href={`/players/${playerSlug(e.holder)}?season=${e.season}`}
                  className="min-w-0 truncate font-semibold hover:underline"
                >
                  {e.holder}
                </Link>
              ) : (
                <p className="min-w-0 truncate font-semibold">{e.holder}</p>
              )}
              <p className="tabular shrink-0 text-lg font-bold">{e.value}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {e.detail} · {e.season}
              {e.week ? `, week ${e.week}` : ''}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
