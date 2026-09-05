'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ACTIVE_OWNERS, ownerColor } from '@/lib/league'
import { positionColor, POSITION_ORDER } from '@/lib/players'
import { BoardEntry, draftedBy, parseRankings, seedFromPool } from '@/lib/draftBoard'
import { DraftPick, PoolPlayer } from '@/lib/types'

interface DraftFeed {
  season: number
  live: boolean
  picks: DraftPick[]
  pool: PoolPlayer[]
}

const STORAGE_PREFIX = 'plff-board-'

/**
 * A manager's private draft board. Rankings are plain text kept in this
 * browser only — no account, nothing on the server — and the list crosses
 * players out as picks land on the league board.
 */
export function MyBoard() {
  const [feed, setFeed] = useState<DraftFeed | null>(null)
  const [error, setError] = useState('')
  const [manager, setManager] = useState('')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [hideDrafted, setHideDrafted] = useState(false)
  const [position, setPosition] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/draft', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data: DraftFeed = await res.json()
      setFeed(data)
      setError('')
    } catch {
      setError('Could not reach the league board — cross-outs may be stale.')
    }
  }, [])

  // Poll while the draft is on; a lazy heartbeat otherwise
  useEffect(() => {
    load()
    const id = setInterval(load, feed?.live ? 10_000 : 60_000)
    return () => clearInterval(id)
  }, [load, feed?.live])

  // Restore this device's board once we know the season
  useEffect(() => {
    if (!feed || loaded) return
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + feed.season)
      if (saved) {
        const parsed = JSON.parse(saved) as { manager?: string; text?: string }
        setManager(parsed.manager ?? '')
        setText(parsed.text ?? '')
        setEditing(!(parsed.text ?? '').trim())
      } else {
        setEditing(true)
      }
    } catch {
      setEditing(true)
    }
    setLoaded(true)
  }, [feed, loaded])

  useEffect(() => {
    if (!feed || !loaded) return
    try {
      localStorage.setItem(STORAGE_PREFIX + feed.season, JSON.stringify({ manager, text }))
    } catch {
      // private mode or storage full — the board still works for this visit
    }
  }, [feed, loaded, manager, text])

  const entries = useMemo(() => (feed ? parseRankings(text, feed.pool) : []), [text, feed])
  const annotated = useMemo(
    () => entries.map((e) => ({ entry: e, pick: feed ? draftedBy(e, feed.picks) : undefined })),
    [entries, feed],
  )
  const remaining = annotated.filter((a) => !a.pick)
  const unmatched = entries.filter((e) => !e.match).length
  const nextUp = remaining.slice(0, 3)
  const visible = annotated.filter(
    (a) => (!hideDrafted || !a.pick) && (!position || (a.entry.position ?? '?') === position),
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Copied — paste it into this page on your other device.')
    } catch {
      setNote('Select the text in the editor and copy it.')
    }
  }

  if (!feed && !error) return <p className="py-16 text-center text-sm text-muted-foreground">Loading the league board…</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <label className="text-sm font-medium">I am</label>
        <select
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— pick your name —</option>
          {ACTIVE_OWNERS.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">so your own picks show green instead of crossed out</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done editing' : 'Edit rankings'}
          </Button>
          {text.trim() && (
            <Button variant="outline" size="sm" onClick={copy}>
              Copy list
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            One player per line, best first. Numbering is optional. A line like <code>## RBs</code> or{' '}
            <code>Tier 2</code> starts a tier. Paste from wherever you keep your rankings — names are matched to the
            league&apos;s player pool, so small spelling differences still cross out.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'1. Bijan Robinson\n2. Jahmyr Gibbs\n3. Ja\'Marr Chase\n\n## My guys\nPuka Nacua\n…'}
            className="h-72 w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {!text.trim() && feed && feed.pool.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setText(seedFromPool(feed.pool))}>
                Start from the league&apos;s player pool
              </Button>
            )}
            <span className="text-muted-foreground">
              {entries.length} players
              {unmatched > 0 && ` · ${unmatched} not found in the pool (shown, but won't auto-cross)`}
            </span>
            {note && <span className="text-muted-foreground">{note}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Saved in this browser only. Nobody else — including the commish — can see it. Use <b>Copy list</b> to move
            it to another device.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-amber-600 dark:text-amber-400">⚠ {error}</p>}

      {entries.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-md bg-secondary px-2 py-1 font-medium">
              {remaining.length} of {entries.length} left
            </span>
            {feed && (
              <span className="text-muted-foreground">
                {feed.live ? `Live · ${feed.picks.length} picks in` : feed.picks.length ? 'Draft complete' : 'Draft not started'}
              </span>
            )}
            {nextUp.length > 0 && (
              <span className="text-muted-foreground">
                Next up: <b className="text-foreground">{nextUp.map((a) => a.entry.name).join(' · ')}</b>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Filter by position"
              >
                <option value="">All positions</option>
                {POSITION_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
                Hide drafted
              </label>
            </div>
          </div>

          <ol className="divide-y divide-border/40 rounded-xl border bg-card shadow-sm">
            {visible.map(({ entry, pick }, i) => {
              const showTier = entry.tier && (i === 0 || visible[i - 1].entry.tier !== entry.tier)
              const mine = pick && manager && pick.team === manager
              return (
                <li key={entry.rank}>
                  {showTier && (
                    <div className="bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.tier}
                    </div>
                  )}
                  <div className={`flex items-center gap-3 px-3 py-1.5 text-sm ${pick && !mine ? 'opacity-50' : ''}`}>
                    <span className="tabular w-7 shrink-0 text-right text-xs text-muted-foreground">{entry.rank}</span>
                    <span
                      className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: positionColor(entry.position) }}
                    >
                      {entry.position ?? '—'}
                    </span>
                    <span className={`min-w-0 flex-1 truncate font-medium ${pick && !mine ? 'line-through' : ''} ${mine ? 'text-win' : ''}`}>
                      {entry.name}
                    </span>
                    {entry.nflTeam && <span className="shrink-0 text-xs text-muted-foreground">{entry.nflTeam}</span>}
                    {!entry.match && <span className="shrink-0 text-xs text-muted-foreground" title="Not in the player pool">?</span>}
                    {pick && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ownerColor(pick.team) }} />
                        {mine ? 'yours' : pick.team} · Rd {pick.round}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing left in this view.</li>
            )}
          </ol>
        </>
      )}

      {!editing && entries.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No rankings yet — hit <b>Edit rankings</b> and paste your list.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Watching the{' '}
        <Link href="/draft" className="underline">
          league board
        </Link>
        {feed?.live ? ' — refreshes every 10 seconds while the draft is on.' : '.'}
      </p>
    </div>
  )
}
