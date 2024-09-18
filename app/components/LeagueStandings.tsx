'use client'

import { useState } from "react"
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
import { Trophy } from 'lucide-react'

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
}

export function LeagueStandings({ standingsData, currentWeek }: { standingsData: StandingsData[], currentWeek: number }) {
  const [sortColumn, setSortColumn] = useState<keyof StandingsData>('Rank')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const sortedStandings = [...standingsData].sort((a, b) => {
    const [aWins, aLosses] = a['Overall Record'].split('-').map(Number);
    const [bWins, bLosses] = b['Overall Record'].split('-').map(Number);

    if (aWins !== bWins) {
      return sortDirection === 'asc' ? aWins - bWins : bWins - aWins;
    }

    if (a['Points For'] !== b['Points For']) {
      return sortDirection === 'asc' ? a['Points For'] - b['Points For'] : b['Points For'] - a['Points For'];
    }

    if (sortColumn === 'Overall Record') {
      return sortDirection === 'asc' ? aLosses - bLosses : bLosses - aLosses;
    }

    if (typeof a[sortColumn] === 'string' && typeof b[sortColumn] === 'string') {
      return sortDirection === 'asc' ? a[sortColumn].localeCompare(b[sortColumn]) : b[sortColumn].localeCompare(a[sortColumn]);
    }

    return sortDirection === 'asc' ? (a[sortColumn] as number) - (b[sortColumn] as number) : (b[sortColumn] as number) - (a[sortColumn] as number);
  });

  const handleSort = (column: keyof StandingsData) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
        <CardTitle className="text-2xl font-bold flex items-center">
          <Trophy className="mr-2 h-6 w-6" />
          League Standings - Week {currentWeek}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-lg border border-gray-200 shadow-md overflow-hidden">
          <Table>
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