"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Player {
  Week: number
  Team: string
  Player: string
  Position: string
  Score: number
}

interface BestLineup {
  QB: Player
  RB1: Player
  RB2: Player
  WR1: Player
  WR2: Player
  DEF: Player
  K: Player
  FLEX: Player
  totalScore: number
}

const WeeklyBestLineup = () => {
  const [weeklyLineups, setWeeklyLineups] = useState<BestLineup[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/api/getData')
      const data = await response.json()
      const processedLineups = processWeeklyLineups(data.players)
      setWeeklyLineups(processedLineups)
    }

    fetchData()
  }, [])

  const processWeeklyLineups = (players: Player[]): BestLineup[] => {
    const weeklyLineups: BestLineup[] = []

    for (let week = 1; week <= 14; week++) {
      const weekPlayers = players.filter(p => p.Week === week)
      const bestLineup = findBestLineup(weekPlayers)
      weeklyLineups.push(bestLineup)
    }

    return weeklyLineups
  }

  const findBestLineup = (players: Player[]): BestLineup => {
    const getTopPlayer = (position: string, index: number = 0) => {
      const filteredPlayers = players.filter(p => p.Position.toUpperCase().includes(position.toUpperCase()));
      return filteredPlayers.sort((a, b) => b.Score - a.Score)[index];
    };

    const positionBest: Omit<BestLineup, 'totalScore'> = {
      QB: getTopPlayer('QB'),
      RB1: getTopPlayer('RB'),
      RB2: getTopPlayer('RB', 1),
      WR1: getTopPlayer('WR'),
      WR2: getTopPlayer('WR', 1),
      DEF: getTopPlayer('DEF'),
      K: getTopPlayer('K'),
      FLEX: {} as Player, // We'll set this later
    };


    const flexCandidates = [
      ...players.filter(p => p.Position.toUpperCase().includes('RB')).sort((a, b) => b.Score - a.Score).slice(2),
      ...players.filter(p => p.Position.toUpperCase().includes('WR')).sort((a, b) => b.Score - a.Score).slice(2),
      ...players.filter(p => p.Position.toUpperCase().includes('TE')).sort((a, b) => b.Score - a.Score),
    ];

    positionBest.FLEX = flexCandidates.sort((a, b) => b.Score - a.Score)[0] || {} as Player;

    const totalScore = (Object.entries(positionBest) as [keyof Omit<BestLineup, 'totalScore'>, Player][])
      .reduce((sum, [_, player]) => sum + (player?.Score || 0), 0);

    return { ...positionBest, totalScore };
  }

  const renderPlayerCard = (player: Player | undefined, position: string) => (
    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg mb-2 hover:bg-secondary/80 transition-colors">
      <div className="flex items-center space-x-2">
        <span className="font-bold text-primary w-12">{position}:</span>
        <span className="text-sm">{player?.Player || 'N/A'}</span>
      </div>
      <span className="font-semibold text-sm bg-primary/10 px-2 py-1 rounded">
        {player?.Score !== undefined ? player.Score.toFixed(2) : 'N/A'}
      </span>
    </div>
  )

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="bg-primary/5">
        <CardTitle className="text-2xl font-bold text-primary">Weekly Best Starting Lineup</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="1" className="w-full">
          <TabsList className="grid w-full grid-cols-7 mb-6">
            {weeklyLineups.map((_, index) => (
              <TabsTrigger 
                key={index + 1} 
                value={(index + 1).toString()}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Week {index + 1}
              </TabsTrigger>
            ))}
          </TabsList>
          {weeklyLineups.map((lineup, index) => (
            <TabsContent key={index + 1} value={(index + 1).toString()}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {renderPlayerCard(lineup.QB, 'QB')}
                  {renderPlayerCard(lineup.RB1, 'RB1')}
                  {renderPlayerCard(lineup.RB2, 'RB2')}
                  {renderPlayerCard(lineup.WR1, 'WR1')}
                </div>
                <div>
                  {renderPlayerCard(lineup.WR2, 'WR2')}
                  {renderPlayerCard(lineup.DEF, 'DEF')}
                  {renderPlayerCard(lineup.K, 'K')}
                  {renderPlayerCard(lineup.FLEX, 'FLEX')}
                </div>
              </div>
              <div className="mt-6 text-right">
                <span className="font-bold text-lg text-primary">
                  Total Score: {lineup.totalScore.toFixed(2)}
                </span>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default WeeklyBestLineup