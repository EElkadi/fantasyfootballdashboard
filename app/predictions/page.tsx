import { Metadata } from 'next'
import { availableSeasons, getPredictions, getSeason } from '@/lib/data'
import { consensusOrder, scorePredictions } from '@/lib/data/predictions'
import { hasLiveSheet } from '@/lib/data/sheets'
import { leaguePasscodeConfigured } from '@/lib/commish/auth'
import { ACTIVE_OWNERS, CURRENT_SEASON, HONORS, LEAGUE, PREDICTIONS_LOCK_AT, predictionsLocked } from '@/lib/league'
import { PredictionForm } from '@/components/league/PredictionForm'
import { TeamMark } from '@/components/league/TeamMark'

export const revalidate = 60
export const metadata: Metadata = { title: 'Predictions' }

export default async function PredictionsPage({ searchParams }: { searchParams: { season?: string } }) {
  const requested = Number(searchParams.season)
  const seasonYear = availableSeasons().includes(requested) ? requested : CURRENT_SEASON
  const [season, predictions] = await Promise.all([getSeason(seasonYear), getPredictions(seasonYear)])

  const isCurrent = seasonYear === CURRENT_SEASON
  const locked = !isCurrent || predictionsLocked()
  const teams = isCurrent ? ACTIVE_OWNERS.map((o) => o.name) : season.teams
  const submitted = predictions.map((p) => p.manager)
  const honors = HONORS.find((h) => h.season === seasonYear)
  const hasStandings = season.standings.length > 0
  const scores = locked ? scorePredictions(predictions, season.standings, honors) : []
  const consensus = locked ? consensusOrder(predictions, teams) : []
  const rankIn = (manager: string, team: string) => {
    const p = predictions.find((x) => x.manager === manager)
    const i = p ? p.order.indexOf(team) : -1
    return i < 0 ? null : i + 1
  }
  const lockText = PREDICTIONS_LOCK_AT.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  })

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Preseason Predictions · {seasonYear}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {locked
            ? 'Ballots are locked. Every week the table below re-scores them against the real standings — lowest error wins bragging rights, and there is nowhere to hide.'
            : `Rank all twelve, call the champion and the Turd, drop a bold take. Ballots hide until kickoff, then get scored against the standings all season. Locks ${lockText}.`}
        </p>
      </div>

      {!locked &&
        (hasLiveSheet() && leaguePasscodeConfigured() ? (
          <PredictionForm teams={teams} submitted={submitted} />
        ) : (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            Ballots open once the commissioner connects the Sheet and sets a league passcode.
          </p>
        ))}

      {!locked && (
        <section className="rounded-xl border bg-card p-4 text-sm shadow-sm">
          <h2 className="font-semibold">
            {submitted.length} of {teams.length} ballots in
          </h2>
          <p className="mt-1 text-muted-foreground">
            {submitted.length > 0 ? submitted.sort().join(', ') : 'Nobody yet — be first.'}
            {submitted.length < teams.length &&
              ` · Still waiting on ${teams.filter((t) => !submitted.includes(t)).join(', ')}.`}
          </p>
        </section>
      )}

      {locked && predictions.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No ballots on file for {seasonYear}.</p>
      )}

      {locked && predictions.length > 0 && (
        <>
          {hasStandings && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">
                Leaderboard{season.lastCompletedWeek < LEAGUE.regularSeasonWeeks ? ` · through week ${season.lastCompletedWeek}` : ' · final'}
              </h2>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">#</th>
                      <th className="px-3 py-2.5 font-medium">Manager</th>
                      <th className="px-3 py-2.5 text-right font-medium" title="Sum of how many spots off each team is">
                        Error
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium">Exact</th>
                      <th className="px-3 py-2.5 font-medium">Champ pick</th>
                      <th className="px-3 py-2.5 font-medium">Turd pick</th>
                      <th className="px-3 py-2.5 text-right font-medium" title="Consensus rank of their own team minus where they put themselves">
                        Homer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, i) => (
                      <tr key={s.manager} className="border-b border-border/40 last:border-0">
                        <td className="tabular px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <TeamMark team={s.manager} />
                        </td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{s.error}</td>
                        <td className="tabular px-3 py-2 text-right text-muted-foreground">{s.exact}</td>
                        <td className="px-3 py-2">
                          {s.champion} {s.championHit === true ? '✅' : s.championHit === false ? '❌' : ''}
                        </td>
                        <td className="px-3 py-2">
                          {s.turd} {s.turdHit === true ? '✅' : s.turdHit === false ? '❌' : ''}
                        </td>
                        <td className="tabular px-3 py-2 text-right text-muted-foreground">
                          {s.homer === undefined ? '—' : s.homer > 0 ? `+${s.homer}` : s.homer}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Consensus</h2>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">#</th>
                      <th className="px-3 py-2.5 font-medium">Team</th>
                      <th className="px-3 py-2.5 text-right font-medium">Avg</th>
                      {hasStandings && <th className="px-3 py-2.5 text-right font-medium">Actual</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {consensus.map((c, i) => {
                      const actual = season.standings.find((s) => s.team === c.team)?.rank
                      const delta = actual === undefined ? 0 : i + 1 - actual
                      return (
                        <tr key={c.team} className={`border-b border-border/40 last:border-0 ${i === LEAGUE.playoffTeams - 1 ? 'border-b-2 border-b-primary/50' : ''}`}>
                          <td className="tabular px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">
                            <TeamMark team={c.team} />
                            {c.firsts > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {c.firsts}× first
                              </span>
                            )}
                          </td>
                          <td className="tabular px-3 py-2 text-right">{c.avgRank.toFixed(1)}</td>
                          {hasStandings && (
                            <td className={`tabular px-3 py-2 text-right ${delta > 0 ? 'text-win' : delta < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
                              {actual ?? '—'}
                              {delta !== 0 && <span className="ml-1 text-xs">({delta > 0 ? '▲' : '▼'}{Math.abs(delta)})</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Every ballot</h2>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky left-0 bg-card px-3 py-2.5 font-medium">Team</th>
                      {predictions.map((p) => (
                        <th key={p.manager} className="px-2 py-2.5 text-center font-medium" title={`${p.manager}'s ballot`}>
                          {p.manager.slice(0, 5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {consensus.map((c) => (
                      <tr key={c.team} className="border-b border-border/40 last:border-0">
                        <td className="sticky left-0 bg-card px-3 py-2">
                          <TeamMark team={c.team} />
                        </td>
                        {predictions.map((p) => {
                          const r = rankIn(p.manager, c.team)
                          const self = p.manager === c.team
                          return (
                            <td
                              key={p.manager}
                              className={`tabular px-2 py-2 text-center ${self ? 'font-bold' : ''} ${
                                r === 1 ? 'text-win' : r === teams.length ? 'text-loss' : ''
                              }`}
                            >
                              {r ?? '·'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Bold = the manager&apos;s own team. Green = picked first, red = picked last.</p>
            </section>
          </div>

          {predictions.some((p) => p.boldTake) && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Bold takes</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {predictions
                  .filter((p) => p.boldTake)
                  .map((p) => (
                    <blockquote key={p.manager} className="rounded-xl border bg-card p-4 shadow-sm">
                      <p className="text-sm">“{p.boldTake}”</p>
                      <footer className="mt-2">
                        <TeamMark team={p.manager} className="text-xs" />
                      </footer>
                    </blockquote>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
