import Link from 'next/link'
import { ownerColor, teamNameOf } from '@/lib/league'

/** Colored chip + owner name, linking to the team page. */
export function TeamMark({
  team,
  showTeamName = false,
  teamNames,
  className = '',
}: {
  team: string
  showTeamName?: boolean
  /** Season's franchise names (SeasonData.teamNames); falls back to OWNERS */
  teamNames?: Record<string, string>
  className?: string
}) {
  return (
    <Link
      href={`/teams/${encodeURIComponent(team.toLowerCase())}`}
      className={`inline-flex items-center gap-2 font-medium hover:underline ${className}`}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: ownerColor(team) }}
      />
      <span>{team}</span>
      {showTeamName && (
        <span className="truncate text-sm font-normal text-muted-foreground">{teamNameOf(team, teamNames)}</span>
      )}
    </Link>
  )
}
