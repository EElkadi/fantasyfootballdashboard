import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface StandingsData {
  Team: string
  'Average Points Against': number
}

export function StrengthOfSchedule({ standingsData }: { standingsData: StandingsData[] }) {
  // Sort data by average points against in descending order
  const sortedData = [...standingsData].sort((a, b) => b['Average Points Against'] - a['Average Points Against'])

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
        <CardTitle className="text-2xl font-bold">Strength of Schedule</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
              <XAxis type="number" className="text-sm font-medium" />
              <YAxis dataKey="Team" type="category" className="text-sm font-medium" width={100} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                labelStyle={{ fontWeight: 'bold', color: '#333' }}
              />
              <Legend />
              <Bar 
                dataKey="Average Points Against" 
                fill="#F59E0B" 
                name="Avg Opponent Score"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}