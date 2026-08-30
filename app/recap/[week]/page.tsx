import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getDefaultSeason } from '@/lib/data'
import { computeStandings } from '@/lib/data/standings'
import { RecapShare, RecapData } from '@/components/league/RecapShare'

export const revalidate = 60

export function generateMetadata({ params }: { params: { week: string } }): Metadata {
  return { title: `Week ${params.week} Recap` }
}

export default async function RecapPage({ params }: { params: { week: string } }) {
  const week = parseInt(params.week)
  if (!week || week < 1 || week > 18) notFound()

  const season = await getDefaultSeason()
  const matchups = season.matchups.filter((m) => m.week === week)
  if (matchups.length === 0) notFound()

  const weekRows = season.teamWeeks.filter((r) => r.week === week)
  const topScore = weekRows.reduce((a, b) => (b.score > a.score ? b : a))
  const weekPlayers = season.playerWeeks.filter((p) => p.week === week)
  const mvp = weekPlayers.length ? weekPlayers.reduce((a, b) => (b.score > a.score ? b : a)) : undefined

  // Standings as they stood after this week
  const throughWeek = computeStandings(
    season.teamWeeks.filter((r) => r.week <= week).map((r) => ({ ...r })),
    season.matchups.filter((m) => m.week <= week),
  )

  const data: RecapData = {
    season: season.season,
    week,
    weekLabel: season.schedule.find((s) => s.week === week)?.label,
    results: matchups.map((m) => {
      const winnerSide = m.team1.team === m.winner ? m.team1 : m.team2
      const loserSide = m.team1.team === m.winner ? m.team2 : m.team1
      return {
        winner: m.winner,
        loser: m.loser,
        winScore: winnerSide.total,
        loseScore: loserSide.total,
        tiebreaker: winnerSide.total === loserSide.total,
      }
    }),
    topScore: { team: topScore.team, score: topScore.score },
    mvp: mvp ? { player: mvp.player, team: mvp.team, score: mvp.score, slot: mvp.slot } : undefined,
    standings: throughWeek.map((s) => ({
      team: s.team,
      record: `${s.overall.wins}-${s.overall.losses}`,
    })),
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Week {week} recap card</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rendered from the box scores — share it straight into the league chat.
          </p>
        </div>
        <Link href={`/matchups?week=${week}`} className="text-sm font-medium text-primary hover:underline">
          Week {week} box scores →
        </Link>
      </div>
      <RecapShare data={data} />
    </div>
  )
}
