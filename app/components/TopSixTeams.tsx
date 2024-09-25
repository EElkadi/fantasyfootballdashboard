import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TeamWeeklyScore {
    Team: string;
    Score: number;
    RB1Score: number;
}

export function TopSixTeams() {
  const [weeklyTopSix, setWeeklyTopSix] = useState<Record<number, TeamWeeklyScore[]>>({})
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [weeks, setWeeks] = useState<number[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/api/getData')
      const data = await response.json()
      const processedData = processWeeklyTopSix(data.weeklyScores)
      setWeeklyTopSix(processedData)
      setWeeks(Object.keys(processedData).map(Number).sort((a, b) => a - b))
      setSelectedWeek(Math.max(...Object.keys(processedData).map(Number)))
    }

    fetchData()
  }, [])

  const processWeeklyTopSix = (weeklyScores: Record<number, TeamWeeklyScore[]>): Record<number, TeamWeeklyScore[]> => {
    const weeklyTopSix: Record<number, TeamWeeklyScore[]> = {}

    Object.entries(weeklyScores).forEach(([week, scores]) => {
      const sortedScores = scores.sort((a, b) => {
        if (b.Score !== a.Score) {
          return b.Score - a.Score
        }
        return b.RB1Score - a.RB1Score
      })

      weeklyTopSix[Number(week)] = sortedScores.slice(0, 6)
    })

    return weeklyTopSix
  }

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-green-500 to-teal-500 text-white">
        <CardTitle className="text-2xl font-bold">Top 6 Teams</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Select onValueChange={(value) => setSelectedWeek(Number(value))} value={selectedWeek.toString()}>
          <SelectTrigger className="w-[180px] mb-4">
            <SelectValue placeholder="Select week" />
          </SelectTrigger>
          <SelectContent>
            {weeks.map(week => (
              <SelectItem key={week} value={week.toString()}>Week {week}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeklyTopSix[selectedWeek]?.map((team, index) => (
              <TableRow key={team.Team}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{team.Team}</TableCell>
                <TableCell className="text-right">{team.Score.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}