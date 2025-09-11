import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

const SEASON_START_DATE = new Date('2025-09-04') // Update this date each year

function calculateCurrentWeek(): number {
  const today = new Date()
  const diffTime = Math.abs(today.getTime() - SEASON_START_DATE.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const currentWeek = Math.floor(diffDays / 7) + 1
  return Math.min(currentWeek, 17) // Assuming a 17-week season
}

export function WeeklyMatchups() {
  const [weeklyMatchups, setWeeklyMatchups] = useState<Record<number, Matchup[]>>({});
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchMatchups() {
      try {
        const response = await fetch('/api/weeklyMatchups');
        if (!response.ok) throw new Error('Failed to fetch matchups');
        const data = await response.json();
        setWeeklyMatchups(data);
        setIsLoading(false);

        // Set the default selected week to the current week
        const currentWeek = calculateCurrentWeek().toString();
        const availableWeeks = Object.keys(data);
        setSelectedWeek(availableWeeks.includes(currentWeek) ? currentWeek : availableWeeks[availableWeeks.length - 1]);
      } catch (error) {
        console.error('Error fetching matchups:', error);
        setIsLoading(false);
      }
    }

    fetchMatchups();
  }, []);

  const weeks = Object.keys(weeklyMatchups).sort((a, b) => Number(a) - Number(b));

  const sortedWeeklyMatchups = Object.fromEntries(
    Object.entries(weeklyMatchups).map(([week, matchups]) => [
      week,
      matchups.sort((a, b) => (b.Team1.TotalScore + b.Team2.TotalScore) - (a.Team1.TotalScore + a.Team2.TotalScore))
    ])
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <CardTitle className="text-2xl font-bold">Weekly Matchups</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={selectedWeek} onValueChange={setSelectedWeek}>
          <TabsList className="grid grid-cols-7 mb-6">
            {weeks.map((week) => (
              <TabsTrigger key={week} value={week} className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
                Week {week}
              </TabsTrigger>
            ))}
          </TabsList>
          {weeks.map((week) => (
            <TabsContent key={week} value={week}>
              <div className="space-y-6">
                {sortedWeeklyMatchups[Number(week)]?.map((matchup, index) => (
                  <MatchupCard key={index} matchup={matchup} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function MatchupCard({ matchup }: { matchup: Matchup }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-100 rounded-lg">
      <TeamCard team={matchup.Team1} />
      <TeamCard team={matchup.Team2} />
    </div>
  )
}

function TeamCard({ team }: { team: TeamMatchup }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-xl font-bold mb-2">{team.Team}</h3>
      <div className="space-y-2">
        {team.Players.map((player, index) => (
          <div key={index} className="flex justify-between items-center">
            <span>{player.Position} - {player.Player}</span>
            <span className="font-semibold">{player.Score.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-2 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="font-bold">Total</span>
          <span className="font-bold text-lg">{team.TotalScore.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}