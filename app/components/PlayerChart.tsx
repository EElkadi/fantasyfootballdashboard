import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface PlayerData {
  Player: string;
  Score: number;
  Week: number;
  Team: string; // Added Team property
}

export function PlayerChart({ playerData }: { playerData: PlayerData[] }) {
  const playerAverages = playerData.reduce((acc, { Player, Score }) => {
    if (!acc[Player]) {
      acc[Player] = { total: 0, count: 0 };
    }
    acc[Player].total += Score;
    acc[Player].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const averagedData = Object.entries(playerAverages).map(([Player, { total, count }]) => ({
    Player,
    AverageScore: count > 0 ? total / count : undefined
  }));

  const sortedData = averagedData
    .filter(player => player.AverageScore !== undefined)
    .sort((a, b) => (b.AverageScore ?? 0) - (a.AverageScore ?? 0))
    .slice(0, 10);

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <CardTitle className="text-2xl font-bold">Top 10 Players by Average Score for {playerData[0]?.Team ?? 'Unknown Team'}</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <ul className="space-y-3">
          {sortedData.map((player, index) => (
            <li key={player.Player} className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200">
              <span className="flex items-center space-x-2">
                <Badge variant={index < 3 ? "default" : "secondary"} className="w-6 h-6 rounded-full flex items-center justify-center">
                  {index + 1}
                </Badge>
                <span className="font-semibold text-lg">{player.Player}</span>
              </span>
              <span className="text-lg font-medium text-blue-600">
                {player.AverageScore?.toFixed(2) ?? 'N/A'}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}