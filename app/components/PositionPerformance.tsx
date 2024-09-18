import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Award } from 'lucide-react'
import { teamColors } from '@/lib/colors'
import { Checkbox } from "@/components/ui/checkbox"

interface PositionData {
  position: string;
  [teamName: string]: number | string;
}

interface PositionPerformanceProps {
  data: PositionData[];
}

export function PositionPerformance({ data }: PositionPerformanceProps) {
  const teams = Object.keys(data[0]).filter(key => key !== 'position');
  const [visibleTeams, setVisibleTeams] = useState<Set<string>>(new Set(teams));

  const toggleTeam = (team: string) => {
    setVisibleTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(team)) {
        newSet.delete(team);
      } else {
        newSet.add(team);
      }
      return newSet;
    });
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 w-full">
      <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
        <CardTitle className="text-xl font-bold flex items-center">
          <Award className="mr-2" />
          Position-specific Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap gap-4">
          {teams.map((team) => (
            <div key={team} className="flex items-center space-x-2">
              <Checkbox
                id={team}
                checked={visibleTeams.has(team)}
                onCheckedChange={() => toggleTeam(team)}
              />
              <label
                htmlFor={team}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {team}
              </label>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="position" />
            <YAxis />
            <Tooltip />
            <Legend />
            {teams.filter(team => visibleTeams.has(team)).map((team, index) => (
              <Bar key={team} dataKey={team} fill={teamColors[index % teamColors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}