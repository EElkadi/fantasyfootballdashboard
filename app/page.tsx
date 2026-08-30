import Link from 'next/link'
import { getDefaultSeason } from '@/lib/data'
import { computePot, CURRENT_SEASON, HONORS, LEAGUE } from '@/lib/league'
import { MatchupCard } from '@/components/league/MatchupCard'
import { StandingsTable } from '@/components/league/StandingsTable'
import { TeamMark } from '@/components/league/TeamMark'
import { simulateSeason } from '@/lib/data/simulate'

export const revalidate = 60

export default async function HomePage() {
  const season = await getDefaultSeason()
  const week = season.lastCompletedWeek
  const weekMatchups = season.matchups.filter((m) => m.week === week)
  const isArchive = season.season !== CURRENT_SEASON
  const regularSeasonDone = week >= LEAGUE.regularSeasonWeeks

  // Weekly awards
  const weekRows = season.teamWeeks.filter((r) => r.week === week)
  const topScore = weekRows.length ? weekRows.reduce((a, b) => (b.score > a.score ? b : a)) : null
  const weekPlayers = season.playerWeeks.filter((p) => p.week === week)
  const mvp = weekPlayers.length ? weekPlayers.reduce((a, b) => (b.score > a.score ? b : a)) : null
  const margins = weekMatchups.map((m) => ({ m, margin: Math.abs(m.team1.total - m.team2.total) }))
  const blowout = margins.length ? margins.reduce((a, b) => (b.margin > a.margin ? b : a)) : null
  const closest = margins.length ? margins.reduce((a, b) => (b.margin < a.margin ? b : a)) : null

  // Next week's slate
  const nextWeek = season.schedule.find((s) => s.week === week + 1 && week + 1 <= LEAGUE.regularSeasonWeeks)
  const nextPairs: [string, string][] = []
  if (nextWeek) {
    const seen = new Set<string>()
    for (const [team, opp] of Object.entries(nextWeek.opponents)) {
      if (seen.has(team) || seen.has(opp)) continue
      seen.add(team)
      seen.add(opp)
      nextPairs.push([team, opp])
    }
  }

  const odds = !isArchive && !regularSeasonDone ? simulateSeason(season) : null
  const playoffsDone = week > LEAGUE.regularSeasonWeeks
  const honors = HONORS.find((h) => h.season === season.season)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            {season.season} season{isArchive ? ' · final' : ''}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {week === 0
              ? 'The season is almost here'
              : playoffsDone && honors?.champion
                ? `${honors.champion} took the crown`
                : regularSeasonDone
                  ? `Regular season complete`
                  : `Week ${week} is in the books`}
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            {week === 0
              ? `Draft day is the Saturday of Labor Day weekend. $${LEAGUE.payouts[0].amount.toLocaleString()} to the champ.`
              : playoffsDone && honors?.champion
                ? [
                    honors.runnerUp && `${honors.runnerUp} fell in the final`,
                    honors.scoringChamp && `${honors.scoringChamp} took the scoring title`,
                    honors.turd && `${honors.turd} is the Turd`,
                  ]
                    .filter(Boolean)
                    .join(' · ') + '.'
                : regularSeasonDone
                  ? `Playoffs run Weeks 15–17 — top ${LEAGUE.playoffTeams} in, top ${LEAGUE.playoffByes} get byes. The bottom ${LEAGUE.turdBowlTeams} fight out the Turd Bowl.`
                  : `${LEAGUE.regularSeasonWeeks - week} week${LEAGUE.regularSeasonWeeks - week === 1 ? '' : 's'} left in the regular season.`}
          </p>
        </div>
        {isArchive && (
          <p className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
            Showing last season while {CURRENT_SEASON} waits for kickoff.
          </p>
        )}
      </section>

      {season.standings.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topScore && (
            <AwardCard title={`Week ${week} top score`}>
              <TeamMark team={topScore.team} />
              <p className="tabular mt-1 text-2xl font-bold">{topScore.score} pts</p>
              <p className="text-xs text-muted-foreground">vs {topScore.opponent}</p>
            </AwardCard>
          )}
          {mvp && (
            <AwardCard title={`Week ${week} MVP`}>
              <p className="truncate font-semibold">{mvp.player}</p>
              <p className="tabular mt-1 text-2xl font-bold">{mvp.score} pts</p>
              <p className="text-xs text-muted-foreground">
                {mvp.slot} · {mvp.team}
              </p>
            </AwardCard>
          )}
          {blowout && blowout.margin > 0 && (
            <AwardCard title="Beatdown of the week">
              <TeamMark team={blowout.m.winner} />
              <p className="tabular mt-1 text-2xl font-bold">+{blowout.margin}</p>
              <p className="text-xs text-muted-foreground">over {blowout.m.loser}</p>
            </AwardCard>
          )}
          {closest && (
            <AwardCard title="Nailbiter of the week">
              <TeamMark team={closest.m.winner} />
              <p className="tabular mt-1 text-2xl font-bold">
                {closest.margin === 0 ? 'tiebreaker' : `by ${closest.margin}`}
              </p>
              <p className="text-xs text-muted-foreground">over {closest.m.loser}</p>
            </AwardCard>
          )}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight">{week > 0 ? `Week ${week} results` : 'Matchups'}</h2>
            <div className="flex gap-4">
              {week > 0 && (
                <Link href={`/recap/${week}`} className="text-sm font-medium text-primary hover:underline">
                  Share recap
                </Link>
              )}
              <Link href="/matchups" className="text-sm font-medium text-primary hover:underline">
                All weeks →
              </Link>
            </div>
          </div>
          {weekMatchups.length > 0 ? (
            <div className="space-y-3">
              {weekMatchups.map((m, i) => (
                <MatchupCard key={i} matchup={m} season={season.season} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              No scores reported yet. Once the commissioner enters Week 1, results land here.
            </p>
          )}

          {nextPairs.length > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Up next — Week {week + 1}
                {season.schedule.find((s) => s.week === week + 1)?.label
                  ? ` · ${season.schedule.find((s) => s.week === week + 1)!.label}`
                  : ''}
              </h3>
              <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {nextPairs.map(([a, b]) => (
                  <li key={a} className="flex items-center justify-between gap-2">
                    <TeamMark team={a} />
                    <span className="text-xs text-muted-foreground">vs</span>
                    <TeamMark team={b} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight">Standings</h2>
            <Link href="/standings" className="text-sm font-medium text-primary hover:underline">
              Full table →
            </Link>
          </div>
          {season.standings.length > 0 ? (
            <StandingsTable standings={season.standings} compact odds={odds?.odds ?? null} />
          ) : (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              Standings appear after the first week of scores.
            </p>
          )}

          <PotCard isArchive={isArchive} waiverFees={season.waivers.reduce((s, m) => s + m.cost, 0)} />
        </section>
      </div>
    </div>
  )
}

function PotCard({ isArchive, waiverFees }: { isArchive: boolean; waiverFees: number }) {
  // Live pot: dues plus every waiver fee paid; archive seasons show the
  // current payout structure instead.
  const pot = computePot(isArchive ? 0 : waiverFees)
  return (
    <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">The pot</h3>
        <span className="tabular text-lg font-extrabold">${pot.pot.toLocaleString()}</span>
      </div>
      {!isArchive && waiverFees > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          ${pot.base.toLocaleString()} dues + ${waiverFees.toLocaleString()} in{' '}
          <Link href="/waivers" className="underline">
            waiver fees
          </Link>
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {pot.payouts.map((p) => (
          <li key={p.place} className="flex justify-between">
            <span className="text-muted-foreground">{p.place}</span>
            <span className="tabular font-medium">${p.amount.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AwardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}
