import { useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface TeamData {
  Week: number
  Team: string
  Score: number
}

export function HeadToHeadAnalysis({ teamsData }: { teamsData: TeamData[] }) {
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')

  const teams = useMemo(() => Array.from(new Set(teamsData.map(item => item.Team))), [teamsData])

  const chartData = useMemo(() => {
    return teamsData
      .filter(item => item.Team === team1 || item.Team === team2)
      .reduce((acc, item) => {
        const weekData = acc.find(d => d.Week === item.Week) || { Week: item.Week }
        weekData[item.Team] = item.Score
        if (!acc.find(d => d.Week === item.Week)) {
          acc.push(weekData)
        }
        return acc
      }, [] as any[])
      .sort((a, b) => a.Week - b.Week)
  }, [teamsData, team1, team2])

  const cumulativeData = useMemo(() => {
    return chartData.reduce((acc, curr) => {
      const prevWeek = acc[acc.length - 1] || { Week: 0, [team1]: 0, [team2]: 0 }
      acc.push({
        Week: curr.Week,
        [team1]: (prevWeek[team1] || 0) + (curr[team1] || 0),
        [team2]: (prevWeek[team2] || 0) + (curr[team2] || 0),
      })
      return acc
    }, [] as any[])
  }, [chartData, team1, team2])

  const headToHeadRecord = useMemo(() => {
    return chartData.reduce(
      (record, week) => {
        if (week[team1] > week[team2]) record.team1Wins++;
        else if (week[team2] > week[team1]) record.team2Wins++;
        else record.ties++;
        return record;
      },
      { team1Wins: 0, team2Wins: 0, ties: 0 }
    )
  }, [chartData, team1, team2])

  const getTeamStats = (team: string) => {
    const scores = chartData.map(week => week[team]).filter(Boolean)
    return {
      highest: Math.max(...scores),
      lowest: Math.min(...scores),
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    }
  }

  const team1Stats = useMemo(() => getTeamStats(team1), [team1, chartData])
  const team2Stats = useMemo(() => getTeamStats(team2), [team2, chartData])

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <CardTitle className="text-2xl font-bold">Head-to-Head Analysis</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
          <Select onValueChange={setTeam1} value={team1}>
            <SelectTrigger className="w-full sm:w-[180px] bg-white border-2 border-indigo-500 rounded-lg">
              <SelectValue placeholder="Select Team 1" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={setTeam2} value={team2}>
            <SelectTrigger className="w-full sm:w-[180px] bg-white border-2 border-purple-500 rounded-lg">
              <SelectValue placeholder="Select Team 2" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {team1 && team2 && (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="weekly">Weekly Comparison</TabsTrigger>
              <TabsTrigger value="cumulative">Cumulative Comparison</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Head-to-Head Record</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-indigo-100 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">{team1}</p>
                    <p className="text-2xl font-bold text-indigo-600">{headToHeadRecord.team1Wins}</p>
                    <p className="text-xs text-gray-500">Wins</p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">{team2}</p>
                    <p className="text-2xl font-bold text-purple-600">{headToHeadRecord.team2Wins}</p>
                    <p className="text-xs text-gray-500">Wins</p>
                  </div>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">Ties</p>
                    <p className="text-2xl font-bold text-gray-600">{headToHeadRecord.ties}</p>
                    <p className="text-xs text-gray-500">Games</p>
                  </div>
                </div>
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Team Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <h4 className="font-medium text-indigo-600 mb-2">{team1}</h4>
                    <p>Highest: <span className="font-semibold">{team1Stats.highest.toFixed(2)}</span></p>
                    <p>Lowest: <span className="font-semibold">{team1Stats.lowest.toFixed(2)}</span></p>
                    <p>Average: <span className="font-semibold">{team1Stats.average.toFixed(2)}</span></p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-medium text-purple-600 mb-2">{team2}</h4>
                    <p>Highest: <span className="font-semibold">{team2Stats.highest.toFixed(2)}</span></p>
                    <p>Lowest: <span className="font-semibold">{team2Stats.lowest.toFixed(2)}</span></p>
                    <p>Average: <span className="font-semibold">{team2Stats.average.toFixed(2)}</span></p>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="weekly">
              <div className="h-[400px] mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="Week" className="text-sm font-medium" />
                    <YAxis className="text-sm font-medium" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#333' }}
                    />
                    <Legend />
                    <Bar dataKey={team1} fill="#6366F1" name={team1} />
                    <Bar dataKey={team2} fill="#A78BFA" name={team2} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            <TabsContent value="cumulative">
              <div className="h-[400px]">
                <h3 className="text-lg font-semibold mb-2">Cumulative Score Comparison</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="Week" className="text-sm font-medium" />
                    <YAxis className="text-sm font-medium" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#333' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey={team1} stroke="#6366F1" name={team1} />
                    <Line type="monotone" dataKey={team2} stroke="#A78BFA" name={team2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}