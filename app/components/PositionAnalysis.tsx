import { useState, useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PlayerRecord {
  Week: number
  Team: string
  Player: string
  Position: string
  Score: number
}

export function PositionAnalysis({ playerData }: { playerData: PlayerRecord[] }) {
  const [selectedPosition, setSelectedPosition] = useState('')

  const positions = useMemo(() => Array.from(new Set(playerData.map(item => item.Position))), [playerData])

  const filteredData = useMemo(() => {
    if (!selectedPosition) return []

    const positionData = playerData.filter(item => item.Position === selectedPosition)
    const playerAverages = positionData.reduce((acc, item) => {
      if (!acc[item.Player]) {
        acc[item.Player] = { Player: item.Player, TotalScore: 0, Count: 0 }
      }
      acc[item.Player].TotalScore += item.Score
      acc[item.Player].Count++
      return acc
    }, {} as Record<string, { Player: string; TotalScore: number; Count: number }>)

    return Object.values(playerAverages)
      .map(item => ({
        Player: item.Player,
        AverageScore: item.TotalScore / item.Count
      }))
      .sort((a, b) => b.AverageScore - a.AverageScore)
      .map((item, index) => ({ ...item, Rank: index + 1 }))
  }, [playerData, selectedPosition])

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
        <CardTitle className="text-2xl font-bold">Position Analysis</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Select onValueChange={setSelectedPosition} value={selectedPosition}>
          <SelectTrigger className="w-full mb-6 bg-white border-2 border-indigo-500 rounded-lg">
            <SelectValue placeholder="Select a position" />
          </SelectTrigger>
          <SelectContent>
            {positions.map(position => (
              <SelectItem key={position} value={position}>{position}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPosition && filteredData.length > 0 && (
          <div className="h-[400px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis 
                  type="number" 
                  dataKey="AverageScore" 
                  name="Average Score" 
                  className="text-sm font-medium"
                  domain={['dataMin', 'dataMax']}
                />
                <YAxis 
                  type="number" 
                  dataKey="Rank" 
                  name="Rank" 
                  className="text-sm font-medium" 
                  reversed
                  domain={[1, 'dataMax']}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#333' }}
                  formatter={(value, name, props) => {
                    if (name === 'Rank') return [props.payload.Player, 'Player'];
                    return [typeof value === 'number' ? value.toFixed(2) : value, name];
                  }}
                />
                <Legend />
                <Scatter 
                  name={selectedPosition} 
                  data={filteredData} 
                  fill="#8B5CF6"
                  stroke="#4F46E5"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}