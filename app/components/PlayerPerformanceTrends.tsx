import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PlayerData {
  Week: number
  Player: string
  Score: number
}

export function PlayerPerformanceTrends({ playerData }: { playerData: PlayerData[] }) {
  const [selectedPlayer, setSelectedPlayer] = useState('')

  const players = Array.from(new Set(playerData.map(item => item.Player)))
  
  const filteredData = playerData
    .filter(item => item.Player === selectedPlayer)
    .sort((a, b) => a.Week - b.Week)
    .map((item, index, array) => {
      const movingAverage = index >= 2 
        ? (array[index].Score + array[index-1].Score + array[index-2].Score) / 3 
        : undefined;
      return { ...item, MovingAverage: movingAverage };
    });

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-green-500 to-teal-600 text-white">
        <CardTitle className="text-2xl font-bold">Player Performance Trends</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <Select onValueChange={setSelectedPlayer} value={selectedPlayer}>
          <SelectTrigger className="w-full mb-6 bg-white border-2 border-teal-500 rounded-lg">
            <SelectValue placeholder="Select a player" />
          </SelectTrigger>
          <SelectContent>
            {players.map(player => (
              <SelectItem key={player} value={player}>{player}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPlayer && (
          <div className="h-[400px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis dataKey="Week" className="text-sm font-medium" />
                <YAxis className="text-sm font-medium" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#333' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="Score" name="Weekly Score" stroke="#10B981" strokeWidth={3} dot={{ r: 6, strokeWidth: 2 }} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="MovingAverage" name="3-Week Average" stroke="#3B82F6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}