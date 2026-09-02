import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { pairsOf } from '@/lib/data/transform'
import { LEAGUE } from '@/lib/league'
import { playerSlug } from '@/lib/players'
import { LineupEntry, SLOTS, Slot, TeamLineup } from '@/lib/types'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60
export const metadata: Metadata = { title: 'Lineups' }

/** ISO timestamps become "Thu 7:10 PM"; anything hand-typed shows as written. */
const fmtTime = (stamp: string) =>
  Number.isNaN(Date.parse(stamp))
    ? stamp
    : new Date(stamp).toLocaleString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      })

interface SideView {
  team: string
  /** slot -> submitted entry */
  submitted: Partial<Record<Slot, LineupEntry>>
  /** the lineup that was actually scored, once the box score exists */
  scored?: TeamLineup
  lastUpdate: string
}

export default async function LineupsPage({ searchParams }: { searchParams: { week?: string; season?: string } }) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()

  // Default to the week being played: the first week with submissions but no
  // scores, else the latest scored week, else week 1.
  const latest = season.lastCompletedWeek
  const pendingWeek = season.lineups.find((l) => l.week > latest)?.week
  const week = searchParams.week ? parseInt(searchParams.week) : pendingWeek ?? (latest || 1)
  const scheduleWeek = season.schedule.find((s) => s.week === week)
  const matchups = season.matchups.filter((m) => m.week === week)
  const entries = season.lineups.filter((l) => l.week === week)

  // Pairings: the schedule if we have it, else whatever was scored, else
  // whoever submitted something
  let pairs: [string, string][] = scheduleWeek ? pairsOf(scheduleWeek) : matchups.map((m) => [m.team1.team, m.team2.team])
  if (pairs.length === 0 && entries.length > 0) {
    pairs = Array.from(new Set(entries.map((e) => e.team))).map((t) => [t, ''])
  }

  const side = (team: string): SideView => {
    const submitted: Partial<Record<Slot, LineupEntry>> = {}
    let lastUpdate = ''
    for (const e of entries.filter((l) => l.team === team)) {
      submitted[e.slot] = e
      if (e.submittedAt > lastUpdate) lastUpdate = e.submittedAt
    }
    const m = matchups.find((x) => x.team1.team === team || x.team2.team === team)
    const scored = m ? (m.team1.team === team ? m.team1 : m.team2) : undefined
    return { team, submitted, scored, lastUpdate }
  }

  const allWeeks = new Set<number>([
    ...season.weeks,
    ...season.lineups.map((l) => l.week),
    ...season.schedule.filter((s) => s.week <= LEAGUE.regularSeasonWeeks).map((s) => s.week),
  ])
  const weekLink = (w: number) => `/lineups?week=${w}${seasonParam ? `&season=${seasonParam}` : ''}`

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Lineups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {season.season} · week {week}
            {scheduleWeek?.label ? ` · ${scheduleWeek.label}` : ''} — who&apos;s starting whom, as submitted in the
            chat. Partial lineups show what&apos;s in so far.
          </p>
        </div>
        <div className="flex gap-1.5 text-sm">
          {availableSeasons().length > 1 &&
            availableSeasons().map((s) => (
              <Link
                key={s}
                href={`/lineups?season=${s}`}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  s === season.season ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s}
              </Link>
            ))}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {Array.from(allWeeks)
          .sort((a, b) => a - b)
          .map((w) => (
            <Link
              key={w}
              href={weekLink(w)}
              className={`tabular rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                w === week
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

      {pairs.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Nothing scheduled for week {week}.</p>
      ) : (
        <div className="space-y-3">
          {pairs.map(([a, b]) => (
            <LineupCard key={a} left={side(a)} right={b ? side(b) : null} season={season.season} />
          ))}
          <p className="text-xs text-muted-foreground">
            ⚠ marks a submitted starter who differs from the player scored in the box score.{' '}
            <Link href={`/matchups?week=${week}${seasonParam ? `&season=${seasonParam}` : ''}`} className="underline">
              Box scores →
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function Status({ s }: { s: SideView }) {
  const n = Object.keys(s.submitted).length
  if (n === 0) {
    return s.scored ? (
      <span className="text-xs text-muted-foreground">from box score</span>
    ) : (
      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">not submitted</span>
    )
  }
  const full = n >= SLOTS.length
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <span
        className={`rounded px-1.5 py-0.5 font-medium ${
          full ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        }`}
      >
        {full ? 'complete' : `partial ${n}/${SLOTS.length}`}
      </span>
      {s.lastUpdate && <span className="text-muted-foreground">{fmtTime(s.lastUpdate)}</span>}
    </span>
  )
}

function Cell({ s, slot, season }: { s: SideView | null; slot: Slot; season: number }) {
  if (!s) return <td className="py-1 pl-4" />
  const sub = s.submitted[slot]
  const scored = s.scored?.players.find((p) => p.slot === slot)?.player
  const name = sub?.player ?? scored
  if (!name) return <td className="py-1 pl-4 pr-2 text-muted-foreground">—</td>
  const mismatch = sub && scored && playerSlug(sub.player) !== playerSlug(scored)
  return (
    <td className={`py-1 pl-4 pr-2 ${sub ? '' : 'text-muted-foreground'}`}>
      <Link href={`/players/${playerSlug(name)}?season=${season}`} className="hover:underline">
        {name}
      </Link>
      {mismatch && (
        <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400" title={`Scored as ${scored}`}>
          ⚠ scored {scored}
        </span>
      )}
    </td>
  )
}

function LineupCard({ left, right, season }: { left: SideView; right: SideView | null; season: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-2 gap-3 border-b px-4 py-3">
        {[left, right].map((s, i) =>
          s ? (
            <div key={s.team} className={`space-y-1 ${i === 1 ? 'text-right' : ''}`}>
              <div className={`flex ${i === 1 ? 'justify-end' : ''}`}>
                <TeamMark team={s.team} />
              </div>
              <div className={`flex ${i === 1 ? 'justify-end' : ''}`}>
                <Status s={s} />
              </div>
            </div>
          ) : (
            <div key="empty" />
          ),
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {SLOTS.map((slot) => (
            <tr key={slot} className="border-t border-border/40 first:border-0">
              <td className="w-12 py-1 pl-4 pr-2 text-xs font-medium text-muted-foreground">{slot}</td>
              <Cell s={left} slot={slot} season={season} />
              <Cell s={right} slot={slot} season={season} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
