'use client'

import { useState, useMemo, useRef } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Trophy, Download } from 'lucide-react'
import { Button } from "@/components/ui/button"
import html2canvas from 'html2canvas'

interface StandingsData {
  Rank: number
  Team: string
  'Win/Loss Record': string
  'Top 6 Record': string
  'Overall Record': string
  'Points For': number
  'Points Against': number
  'Average Points For': number
  'Average Points Against': number
  'Point Differential': number
  'WIN COUNT': number
  'LOSS COUNT': number
  'Head-to-Head': Record<string, number>;
}

export function LeagueStandings({ standingsData, currentWeek }: { standingsData: StandingsData[], currentWeek: number }) {
  const [sortColumn, setSortColumn] = useState<keyof StandingsData>('Rank')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const tableRef = useRef<HTMLTableElement>(null)

  const sortedStandings = useMemo(() => {
    return [...standingsData].sort((a, b) => {
      // 1. Overall Record
      const [aWins, aLosses] = a['Overall Record'].split('-').map(Number);
      const [bWins, bLosses] = b['Overall Record'].split('-').map(Number);

      if (aWins !== bWins) {
        return bWins - aWins; // Sort by wins in descending order
      }
      if (aLosses !== bLosses) {
        return aLosses - bLosses; // If wins are equal, sort by losses in ascending order
      }

      // 2. Head to Head
      const aHeadToHead = a['Head-to-Head'][b.Team] || 0;
      const bHeadToHead = b['Head-to-Head'][a.Team] || 0;
      if (aHeadToHead !== bHeadToHead) {
        return bHeadToHead - aHeadToHead; // Team with more head-to-head wins ranks higher
      }

      // 3. Points For
      return b['Points For'] - a['Points For'];
    });
  }, [standingsData]);

  // Update ranks based on the new sorting
  sortedStandings.forEach((team, index) => {
    team.Rank = index + 1;
  });

  const handleSort = (column: keyof StandingsData) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const saveAsImage = async () => {
    if (tableRef.current) {
      const canvas = await html2canvas(tableRef.current)
      const image = canvas.toDataURL("image/png")
      const link = document.createElement('a')
      link.href = image
      link.download = `league_standings_week_${currentWeek}.png`
      link.click()
    }
  }

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl font-bold flex items-center">
            <Trophy className="mr-2 h-6 w-6" />
            League Standings - Week {currentWeek}
          </CardTitle>
          <Button variant="secondary" size="sm" onClick={saveAsImage}>
            <Download className="mr-2 h-4 w-4" />
            Save as Image
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-lg border border-gray-200 shadow-md overflow-hidden">
          <Table ref={tableRef}>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead className="w-[60px] md:w-[100px] font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Rank')}>Rank</TableHead>
                <TableHead className="font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Team')}>Team</TableHead>
                <TableHead className="font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Overall Record')}>Overall</TableHead>
                <TableHead className="hidden md:table-cell font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Win/Loss Record')}>W-L</TableHead>
                <TableHead className="hidden lg:table-cell font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Top 6 Record')}>Top 6</TableHead>
                <TableHead className="font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Points For')}>PF</TableHead>
                <TableHead className="font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Points Against')}>PA</TableHead>
                <TableHead className="hidden sm:table-cell font-semibold text-gray-700 cursor-pointer" onClick={() => handleSort('Point Differential')}>DIFF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStandings.map((team, index) => (
                <TableRow 
                  key={team.Team} 
                  className={`
                    ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    hover:bg-gray-100 transition-colors duration-150 ease-in-out
                  `}
                >
                  <TableCell className="font-medium text-gray-900">{team.Rank}</TableCell>
                  <TableCell className="font-medium text-gray-900">{team.Team}</TableCell>
                  <TableCell className="text-gray-700">{team['Overall Record']}</TableCell>
                  <TableCell className="hidden md:table-cell text-gray-700">{team['Win/Loss Record']}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-700">{team['Top 6 Record']}</TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TableCell className="text-gray-700">{team['Points For'].toFixed(2)}</TableCell>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">Avg: {team['Average Points For'].toFixed(2)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TableCell className="text-gray-700">{team['Points Against'].toFixed(2)}</TableCell>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">Avg: {team['Average Points Against'].toFixed(2)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TableCell className="hidden sm:table-cell text-gray-700">{team['Point Differential'].toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}