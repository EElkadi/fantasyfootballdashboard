import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Award, Calendar, Users } from 'lucide-react'

interface TeamStats {
  Team: string
  'Win/Loss Record': string
  'Top 6 Record': string
  'Overall Record': string
  'Points For': number
  'Points Against': number
  'Average Points For'?: number
  'Average Points Against'?: number
  'Point Differential'?: number
}

interface DashboardCardsProps {
  teamStats: TeamStats
  leaguePosition: {
    rank: number
    totalTeams: number
    pointsFor: number
  }
  topPlayer: {
    player: string
    position: string
    seasonAverage: number
  }
  nextMatch: {
    opponent: string
    week: number
    opponentRank: number
    opponentAverageScore: number
  }
}

export function DashboardCards({ teamStats, leaguePosition, topPlayer, nextMatch }: DashboardCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Team Statistics</CardTitle>
          <Users className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <StatItem label="Overall Record" value={teamStats['Overall Record']} highlight />
            <StatItem label="Win/Loss Record" value={teamStats['Win/Loss Record']} />
            <StatItem label="Top 6 Record" value={teamStats['Top 6 Record']} />
            <StatItem label="Avg Points For" value={teamStats['Average Points For']?.toFixed(2) ?? 'N/A'} />
            <StatItem label="Avg Points Against" value={teamStats['Average Points Against']?.toFixed(2) ?? 'N/A'} />
            <StatItem label="Point Differential" value={teamStats['Point Differential']?.toFixed(2) ?? 'N/A'} highlight />
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">League Position</CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center">
            <p className="text-6xl font-bold text-emerald-600 mb-2">#{leaguePosition.rank}</p>
            <p className="text-lg text-gray-600">out of {leaguePosition.totalTeams} teams</p>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">Total Points</p>
              <p className="text-xl font-semibold text-emerald-600">{leaguePosition.pointsFor.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Player</CardTitle>
          <Award className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center mt-4">
            <p className="text-2xl font-bold text-indigo-600">{topPlayer.player}</p>
            <Badge variant="secondary" className="mt-1 mb-2">{topPlayer.position}</Badge>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">Season Average</p>
              <p className="text-xl font-semibold text-indigo-600">{topPlayer.seasonAverage.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Next Match</CardTitle>
          <Calendar className="h-4 w-4 text-pink-500" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-pink-600">{nextMatch.opponent}</p>
            <p className="text-sm text-gray-500 mt-2">Week {nextMatch.week}</p>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">Opponent&apos;s Rank</p>
              <p className="text-xl font-semibold text-pink-600">#{nextMatch.opponentRank}</p>
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">Opponent&apos;s Average Score</p>
              <p className="text-xl font-semibold text-pink-600">{nextMatch.opponentAverageScore.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
function StatItem({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${highlight ? 'text-blue-600' : ''}`}>{value}</span>
    </div>
  )
}
