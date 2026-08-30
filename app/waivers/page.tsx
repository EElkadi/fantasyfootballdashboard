import Link from 'next/link'
import { Metadata } from 'next'
import { availableSeasons, getDefaultSeason, getSeason } from '@/lib/data'
import { parseDraftCell } from '@/lib/data/transform'
import { computePot, CURRENT_SEASON } from '@/lib/league'
import { playerSlug, positionColor } from '@/lib/players'
import { Trade } from '@/lib/types'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60
export const metadata: Metadata = { title: 'Transactions' }

export default async function WaiversPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasonParam = searchParams.season ? parseInt(searchParams.season) : undefined
  const season = seasonParam ? await getSeason(seasonParam) : await getDefaultSeason()
  const { waivers } = season

  const totalFees = waivers.reduce((s, m) => s + m.cost, 0)
  const pot = computePot(totalFees)
  const isCurrent = season.season === CURRENT_SEASON

  const byTeam = new Map<string, { moves: number; spent: number }>()
  for (const m of waivers) {
    if (!byTeam.has(m.team)) byTeam.set(m.team, { moves: 0, spent: 0 })
    const t = byTeam.get(m.team)!
    t.moves++
    t.spent += m.cost
  }
  const spenders = Array.from(byTeam.entries())
    .map(([team, v]) => ({ team, ...v }))
    .sort((a, b) => b.spent - a.spent)

  const weeks = Array.from(new Set(waivers.map((m) => m.week))).sort((a, b) => a - b)

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {season.season} · waiver fees start at $20 and climb $20 per add — every dollar goes into the pot.
          </p>
        </div>
        <div className="flex gap-1.5 text-sm">
          {availableSeasons().map((s) => (
            <Link
              key={s}
              href={`/waivers?season=${s}`}
              className={`rounded-md px-2.5 py-1 font-medium ${
                s === season.season ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiver fees collected</p>
          <p className="tabular mt-1 text-3xl font-extrabold">${totalFees.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{waivers.length} adds</p>
        </div>
        {isCurrent ? (
          <>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">The pot</p>
              <p className="tabular mt-1 text-3xl font-extrabold">${pot.pot.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                ${pot.base.toLocaleString()} dues + ${pot.waiverFees.toLocaleString()} waivers
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current payouts</p>
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {pot.payouts.map((p) => (
                  <li key={p.place} className="flex justify-between">
                    <span className="text-muted-foreground">{p.place}</span>
                    <span className="tabular font-semibold">${p.amount.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          spenders[0] && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest spender</p>
              <div className="mt-1.5">
                <TeamMark team={spenders[0].team} />
              </div>
              <p className="tabular text-2xl font-extrabold">${spenders[0].spent.toLocaleString()}</p>
            </div>
          )
        )}
      </section>

      {waivers.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No waiver moves yet — the wire opens the Wednesday before Week 5.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <section className="space-y-4">
            {weeks.map((week) => (
              <div key={week} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b bg-secondary/40 px-4 py-2 text-sm font-semibold">Week {week}</div>
                <table className="w-full text-sm">
                  <tbody>
                    {waivers
                      .filter((m) => m.week === week)
                      .map((m, i) => (
                        <tr key={i} className="border-b border-border/40 last:border-0">
                          <td className="w-32 px-4 py-2">
                            <TeamMark team={m.team} />
                          </td>
                          <td className="px-2 py-2">
                            <Link
                              href={`/players/${playerSlug(m.player)}?season=${season.season}`}
                              className="font-medium hover:underline"
                            >
                              {m.player}
                            </Link>
                            {m.position && (
                              <span
                                className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                                style={{ backgroundColor: positionColor(m.position) }}
                              >
                                {m.position}
                              </span>
                            )}
                            {m.nflTeam && <span className="ml-1.5 text-xs text-muted-foreground">{m.nflTeam}</span>}
                          </td>
                          <td className="tabular w-20 px-4 py-2 text-right font-semibold">${m.cost}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">Spending</h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <tbody>
                  {spenders.map((s) => (
                    <tr key={s.team} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">
                        <TeamMark team={s.team} />
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">{s.moves}×</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">${s.spent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Per the constitution, each manager&apos;s fee escalates: $20 for the first add, $40 for the second, and so
              on. The wire runs from Week 5 to the Wednesday before Week 11.
            </p>
          </section>
        </div>
      )}

      <TradesSection trades={season.trades} season={season.season} />
    </div>
  )
}

function TradeAssets({ assets, season }: { assets: string[]; season: number }) {
  return (
    <ul className="space-y-1">
      {assets.map((asset, i) => {
        const parsed = parseDraftCell(asset)
        if (!parsed.position) {
          // A pick swap or other non-player asset
          return (
            <li key={i} className="text-sm text-muted-foreground">
              {asset}
            </li>
          )
        }
        return (
          <li key={i} className="text-sm">
            <Link href={`/players/${playerSlug(parsed.player)}?season=${season}`} className="font-medium hover:underline">
              {parsed.player}
            </Link>
            <span
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: positionColor(parsed.position) }}
            >
              {parsed.position}
            </span>
            {parsed.nflTeam && <span className="ml-1.5 text-xs text-muted-foreground">{parsed.nflTeam}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function TradesSection({ trades, season }: { trades: Trade[]; season: number }) {
  if (trades.length === 0) return null
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Trades</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {trades.length} deal{trades.length === 1 ? '' : 's'} in {season}. Trade deadline is Week 12.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {trades.map((t, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <TeamMark team={t.team1} className="text-sm normal-case tracking-normal" /> receives
                </div>
                <TradeAssets assets={t.team1Gets} season={season} />
              </div>
              <div className="space-y-2 border-l pl-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <TeamMark team={t.team2} className="text-sm normal-case tracking-normal" /> receives
                </div>
                <TradeAssets assets={t.team2Gets} season={season} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
