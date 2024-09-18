import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { teamColors } from '@/lib/colors'

interface TeamData {
  Week: number
  Team: string
  Score: number
}

interface TeamChartProps {
  teamData: TeamData[]
  selectedTeams: string[]
  onTeamToggle: (team: string) => void
}

export function TeamChart({ teamData, selectedTeams = [], onTeamToggle }: TeamChartProps) {
  const processedData = teamData.reduce((acc, curr) => {
    const weekData = acc.find(d => d.Week === curr.Week) || { Week: curr.Week }
    weekData[curr.Team] = curr.Score
    if (!acc.find(d => d.Week === curr.Week)) {
      acc.push(weekData)
    }
    return acc
  }, [] as any[])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Performance Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {Array.from(new Set(teamData.map(d => d.Team))).map((team, index) => (
            <div key={team} className="flex items-center">
              <Checkbox
                id={`team-${team}`}
                checked={selectedTeams.includes(team)}
                onCheckedChange={() => onTeamToggle(team)}
              />
              <label
                htmlFor={`team-${team}`}
                className="ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                style={{ color: teamColors[index % teamColors.length] }}
              >
                {team}
              </label>
            </div>
          ))}
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="Week" className="text-sm" />
              <YAxis className="text-sm" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              {selectedTeams.map((team, index) => (
                <Line 
                  key={team}
                  type="monotone" 
                  dataKey={team} 
                  stroke={teamColors[index % teamColors.length]}
                  strokeWidth={2} 
                  dot={{ r: 4, fill: teamColors[index % teamColors.length] }}
                  activeDot={{ r: 6, fill: teamColors[index % teamColors.length], stroke: 'hsl(var(--background))' }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}