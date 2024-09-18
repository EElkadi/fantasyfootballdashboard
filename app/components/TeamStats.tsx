import { CardContent } from "@/components/ui/card"

interface TeamStats {
  Team: string
  'Win/Loss Record': string
  'Top 6 Record': string
  'Overall Record': string
  'Points For': number
  'Points Against': number
  'Average Points For'?: number
  'Average Points Against'?: number
  'Point Differential'?: number
}

export function TeamStats({ teamStats }: { teamStats: TeamStats }) {
  return (
    <CardContent>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Overall Record</span>
          <span className="text-2xl font-bold">{teamStats['Overall Record']}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Win/Loss Record</span>
          <span className="text-2xl font-bold">{teamStats['Win/Loss Record']}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Top 6 Record</span>
          <span className="text-2xl font-bold">{teamStats['Top 6 Record']}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Avg Points For</span>
          <span className="text-2xl font-bold">
            {teamStats['Average Points For']?.toFixed(2) ?? 'N/A'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Avg Points Against</span>
          <span className="text-2xl font-bold">
            {teamStats['Average Points Against']?.toFixed(2) ?? 'N/A'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Point Differential</span>
          <span className="text-2xl font-bold">
            {teamStats['Point Differential']?.toFixed(2) ?? 'N/A'}
          </span>
        </div>
      </div>
    </CardContent>
  )
}