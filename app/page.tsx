'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LeagueStandings } from '@/app/components/LeagueStandings'
import { TeamChart } from '@/app/components/TeamChart'
import { PlayerChart } from '@/app/components/PlayerChart'
import { DashboardCards } from '@/app/components/DashboardCards'
import { PlayerPerformanceTrends } from '@/app/components/PlayerPerformanceTrends'
import { HeadToHeadAnalysis } from '@/app/components/HeadToHeadAnalysis'
import { PositionAnalysis } from '@/app/components/PositionAnalysis'
import { WeeklyMVPShowcase } from '@/app/components/WeeklyMVPShowcase'
import { StrengthOfSchedule } from '@/app/components/StrengthOfSchedule'
import { PositionPerformance } from '@/app/components/PositionPerformance'
import { PlayerLeaderboard } from '@/app/components/PlayerLeaderboard'
import WeeklyBestLineup from '@/app/components/WeeklyBestLineup'
import { PlayerScatterPlot } from '@/app/components/PlayerScatterPlot'
import { WeeklyMatchups } from '@/app/components/WeeklyMatchups'
import { TopSixTeams } from '@/app/components/TopSixTeams'

interface Data {
  teams: any[]
  players: any[]
  standings: any[]
  schedule: any[]
  weeklyMatchups: Record<number, Matchup[]>
}

interface PositionData {
  position: string
  [team: string]: string | number
}

interface Player {
  Player: string
  Position: string
  Score: number
}

interface TeamMatchup {
  Team: string
  Players: Player[]
  TotalScore: number
}

interface Matchup {
  Team1: TeamMatchup
  Team2: TeamMatchup
}

export default function Home() {
  const [data, setData] = useState<Data>({ teams: [], players: [], standings: [], schedule: [], weeklyMatchups: {} })
  const [selectedTeam, setSelectedTeam] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])

  const calculateCurrentWeek = (startDate: Date): number => {
    const today = new Date()
    const diffTime = Math.abs(today.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const weeksSinceStart = Math.floor(diffDays / 7)
    return Math.min(weeksSinceStart + 1, 17) // Assuming a 17-week season
  }

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/getData')
        const fetchedData: Data = await response.json()
        setData(fetchedData)
        if (fetchedData.standings.length > 0) {
          setSelectedTeam(fetchedData.standings[0].Team)
          setSelectedTeams(fetchedData.standings.map(team => team.Team))
        }
        
        // Set the current week based on the current date
        const seasonStartDate = new Date('2025-09-10') // Update this date each year
        const calculatedWeek = calculateCurrentWeek(seasonStartDate)
        setCurrentWeek(calculatedWeek)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  const selectedTeamStats = data.standings.find(team => team.Team === selectedTeam)
  const topPlayer = data.players
    .filter(player => player.Team === selectedTeam)
    .reduce((top, player) => (player.Score > top.Score ? player : top), { Score: 0 })

  const getNextMatch = (team: string, week: number): string => {
    const nextWeek = week + 1
    if (!data.schedule) return 'No schedule data'
    const scheduleRow = data.schedule.find(row => parseInt(row.Week) === nextWeek)
    if (scheduleRow) {
      const opponent = Object.entries(scheduleRow).find(([key, value]: [string, unknown]) => 
        key !== 'Week' && (value === team || key === team)
      )
      return opponent ? (opponent[0] === team ? opponent[1] as string : opponent[0]) : 'Bye'
    }
    return 'Season End'
  }

  const calculatePositionPerformance = (playersData: any[]): PositionData[] => {
    const positions = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'Flex', 'K', 'DEF'];
    const teamScores: { [key: string]: { [key: string]: number[] } } = {};

    playersData.forEach(player => {
      if (!teamScores[player.Team]) {
        teamScores[player.Team] = {};
      }
      if (!teamScores[player.Team][player.Position]) {
        teamScores[player.Team][player.Position] = [];
      }
      teamScores[player.Team][player.Position].push(player.Score);
    });

    return positions.map(position => {
      const positionData: PositionData = { position };
      Object.keys(teamScores).forEach(team => {
        const scores = teamScores[team][position] || [];
        positionData[team] = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;
      });
      return positionData;
    });
  };

  const positionPerformanceData = calculatePositionPerformance(data.players);

  return (
    <div className="container mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <Card className="mb-10 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-700 text-white">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <CardTitle className="text-3xl font-bold mb-4 sm:mb-0">Premier League Fantasy Football Dashboard</CardTitle>
            <Select onValueChange={setSelectedTeam} value={selectedTeam}>
              <SelectTrigger className="w-full sm:w-[280px] bg-white text-black border-2 border-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {data.standings.map(team => (
                  <SelectItem key={team.Team} value={team.Team}>{team.Team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="flex flex-wrap justify-center sm:justify-start bg-gray-100 p-1 rounded-lg">
              <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-md">Overview</TabsTrigger>
              <TabsTrigger value="team-analysis" className="data-[state=active]:bg-white data-[state=active]:shadow-md">Team Analysis</TabsTrigger>
              <TabsTrigger value="player-analysis" className="data-[state=active]:bg-white data-[state=active]:shadow-md">Player Analysis</TabsTrigger>
              <TabsTrigger value="league-insights" className="data-[state=active]:bg-white data-[state=active]:shadow-md">League Insights</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6">
              <DashboardCards
                teamStats={selectedTeamStats || {}}
                leaguePosition={{
                  rank: selectedTeamStats?.Rank || 0,
                  totalTeams: data.standings.length,
                  pointsFor: selectedTeamStats?.['Points For'] || 0,
                }}
                topPlayer={{
                  player: topPlayer.Player,
                  position: topPlayer.Position,
                  seasonAverage: (data.players.filter(p => p.Player === topPlayer.Player).reduce((sum, p) => sum + p.Score, 0) / 
                    data.players.filter(p => p.Player === topPlayer.Player).length),
                }}
                nextMatch={{
                  opponent: getNextMatch(selectedTeam, currentWeek),
                  week: currentWeek + 1,
                  opponentRank: data.standings.find(team => team.Team === getNextMatch(selectedTeam, currentWeek))?.Rank || 0,
                  opponentAverageScore: data.standings.find(team => team.Team === getNextMatch(selectedTeam, currentWeek))?.['Average Points For'] || 0,
                }}
              />
              <TeamChart 
                teamData={data.teams} 
                selectedTeams={selectedTeams}
                onTeamToggle={(team) => {
                  setSelectedTeams(prev => 
                    prev.includes(team) 
                      ? prev.filter(t => t !== team) 
                      : [...prev, team]
                  )
                }}
              />
              <LeagueStandings standingsData={data.standings} currentWeek={currentWeek} />
              <WeeklyMatchups />
            </TabsContent>

            <TabsContent value="team-analysis" className="space-y-4">
              <TeamChart 
                teamData={data.teams.filter(team => team.Team === selectedTeam)}
                selectedTeams={[selectedTeam]}
                onTeamToggle={() => {}} // No-op function since we're not toggling teams here
              />
              <HeadToHeadAnalysis teamsData={data.teams} />
              <PlayerChart playerData={data.players.filter(player => player.Team === selectedTeam)} />
              <PlayerPerformanceTrends playerData={data.players.filter(player => player.Team === selectedTeam)} />
            </TabsContent>

            <TabsContent value="player-analysis" className="space-y-4">
              <PlayerLeaderboard playerData={data.players} />
              <PositionAnalysis playerData={data.players} />
              <PlayerScatterPlot playerData={data.players} />
            </TabsContent>

            <TabsContent value="league-insights" className="space-y-4">
              <LeagueStandings standingsData={data.standings} currentWeek={currentWeek} />
              <TopSixTeams />
              <WeeklyMVPShowcase playerData={data.players} />
              <WeeklyBestLineup />
              <StrengthOfSchedule standingsData={data.standings} />
              <PositionPerformance data={positionPerformanceData} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
