import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"

interface PlayerData {
  Player: string
  Team: string
  Position: string
  Score: number
  Week: number
}

interface PlayerLeaderboardProps {
  playerData: PlayerData[]
}

export function PlayerLeaderboard({ playerData }: PlayerLeaderboardProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const leaderboardData = useMemo(() => {
    const playerStats = playerData.reduce((acc, curr) => {
      if (!acc[curr.Player]) {
        acc[curr.Player] = { 
          Player: curr.Player, 
          Team: curr.Team, 
          Position: curr.Position,
          TotalScore: 0, 
          GamesPlayed: 0 
        }
      }
      acc[curr.Player].TotalScore += curr.Score
      acc[curr.Player].GamesPlayed++
      return acc
    }, {} as Record<string, { Player: string; Team: string; Position: string; TotalScore: number; GamesPlayed: number }>)

    return Object.values(playerStats)
      .map(player => ({
        ...player,
        AverageScore: player.TotalScore / player.GamesPlayed
      }))
      .sort((a, b) => b.TotalScore - a.TotalScore)
  }, [playerData])

  const filteredData = leaderboardData.filter(player => 
    player.Player.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.Team.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.Position.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <CardTitle className="text-2xl font-bold">Player Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Input
          placeholder="Search by player, team, or position..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-4"
        />
        <div className="overflow-x-auto">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] sticky top-0 bg-white z-10">Rank</TableHead>
                  <TableHead className="sticky top-0 bg-white z-10">Player</TableHead>
                  <TableHead className="sticky top-0 bg-white z-10">Team</TableHead>
                  <TableHead className="sticky top-0 bg-white z-10">Position</TableHead>
                  <TableHead className="text-right sticky top-0 bg-white z-10">Total Score</TableHead>
                  <TableHead className="text-right sticky top-0 bg-white z-10">Avg Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((player, index) => (
                  <TableRow key={player.Player}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>{player.Player}</TableCell>
                    <TableCell>{player.Team}</TableCell>
                    <TableCell>{player.Position}</TableCell>
                    <TableCell className="text-right">{player.TotalScore.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{player.AverageScore.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}