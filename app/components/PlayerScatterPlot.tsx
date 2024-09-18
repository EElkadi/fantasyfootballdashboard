import { useState, useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PlayerData {
  Player: string
  Team: string
  Position: string
  Score: number
  Week: number
}

interface ScatterData {
  Player: string
  Team: string
  Position: string
  AverageScore: number
  StandardDeviation: number
}

const positionColors = {
  'QB': '#FF6B6B',
  'RB': '#4ECDC4', // Combined RB1 and RB2
  'WR': '#45B7D1', // Combined WR1 and WR2
  'Flex': '#FFA500',
  'K': '#9B59B6',
  'DEF': '#2ECC71'
}

export function PlayerScatterPlot({ playerData }: { playerData: PlayerData[] }) {
  const [selectedPosition, setSelectedPosition] = useState<string>('All')

  const positions = useMemo(() => ['All', 'QB', 'RB', 'WR', 'Flex', 'K', 'DEF'], [])

  const scatterData: ScatterData[] = useMemo(() => {
    const playerStats = playerData.reduce((acc, curr) => {
      const position = curr.Position === 'RB1' || curr.Position === 'RB2' ? 'RB' :
                       curr.Position === 'WR1' || curr.Position === 'WR2' ? 'WR' :
                       curr.Position

      if (!acc[curr.Player]) {
        acc[curr.Player] = { 
          Player: curr.Player, 
          Team: curr.Team, 
          Position: position,
          Scores: [],
        }
      }
      acc[curr.Player].Scores.push(curr.Score)
      return acc
    }, {} as Record<string, { Player: string; Team: string; Position: string; Scores: number[] }>)

    return Object.values(playerStats).map(player => {
      const averageScore = player.Scores.reduce((sum, score) => sum + score, 0) / player.Scores.length
      const variance = player.Scores.reduce((sum, score) => sum + Math.pow(score - averageScore, 2), 0) / player.Scores.length
      const standardDeviation = Math.sqrt(variance)

      return {
        Player: player.Player,
        Team: player.Team,
        Position: player.Position,
        AverageScore: averageScore,
        StandardDeviation: standardDeviation,
      }
    })
  }, [playerData])

  const filteredData = selectedPosition === 'All' 
    ? scatterData 
    : scatterData.filter(player => player.Position === selectedPosition)

  const maxAvg = Math.max(...filteredData.map(d => d.AverageScore))
  const maxStd = Math.max(...filteredData.map(d => d.StandardDeviation))

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
        <CardTitle className="text-2xl font-bold">Player Performance Scatter Plot</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Select onValueChange={setSelectedPosition} value={selectedPosition}>
          <SelectTrigger className="w-full mb-6 bg-white border-2 border-blue-500 rounded-lg">
            <SelectValue placeholder="Select a position" />
          </SelectTrigger>
          <SelectContent>
            {positions.map(position => (
              <SelectItem key={position} value={position}>{position}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-[600px]"> {/* Increased height to accommodate legend */}
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 70, left: 70 }}>
              <XAxis 
                type="number" 
                dataKey="AverageScore" 
                name="Average Score" 
                domain={[0, maxAvg]}
                label={{ value: 'Average Score', position: 'bottom', offset: 50 }}
              />
              <YAxis 
                type="number" 
                dataKey="StandardDeviation" 
                name="Standard Deviation" 
                domain={[0, maxStd]}
                label={{ value: 'Standard Deviation', angle: -90, position: 'left', offset: 50 }}
              />
              <ZAxis type="category" dataKey="Player" name="Player" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-2 border border-gray-300 rounded shadow">
                        <p className="font-bold">{data.Player}</p>
                        <p>{data.Team} - {data.Position}</p>
                        <p>Avg Score: {data.AverageScore.toFixed(2)}</p>
                        <p>Std Dev: {data.StandardDeviation.toFixed(2)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                layout="horizontal" 
                verticalAlign="top" 
                align="center"
                wrapperStyle={{ paddingBottom: '20px' }}
              />
              {Object.entries(positionColors).map(([position, color]) => (
                <Scatter 
                  key={position}
                  name={position}
                  data={filteredData.filter(player => player.Position === position)}
                  fill={color}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
