import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface PlayerData {
  Week: number
  Player: string
  Team: string
  Position: string
  Score: number
}

export function WeeklyMVPShowcase({ playerData }: { playerData: PlayerData[] }) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)

  const weeks = Array.from(new Set(playerData.map(item => item.Week))).sort((a, b) => a - b)

  const weeklyMVP = selectedWeek
    ? playerData
        .filter(item => item.Week === selectedWeek)
        .reduce((mvp, player) => (player.Score > mvp.Score ? player : mvp), { Score: 0 } as PlayerData)
    : null

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-pink-500 to-rose-500 text-white">
        <CardTitle className="text-2xl font-bold">Weekly MVP Showcase</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Select onValueChange={(value) => setSelectedWeek(Number(value))} value={selectedWeek?.toString()}>
          <SelectTrigger className="w-full mb-6 bg-white border-2 border-rose-500 rounded-lg">
            <SelectValue placeholder="Select a week" />
          </SelectTrigger>
          <SelectContent>
            {weeks.map(week => (
              <SelectItem key={week} value={week.toString()}>Week {week}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {weeklyMVP && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-2xl font-bold text-center mb-4">{weeklyMVP.Player}</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Team</p>
                <p className="text-lg font-semibold">{weeklyMVP.Team}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Position</p>
                <Badge variant="secondary" className="text-lg font-semibold">{weeklyMVP.Position}</Badge>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Score</p>
              <p className="text-3xl font-bold text-rose-600">{weeklyMVP.Score.toFixed(2)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}