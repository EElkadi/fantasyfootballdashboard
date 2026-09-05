'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ACTIVE_OWNERS, ownerColor } from '@/lib/league'
import { positionColor, POSITION_ORDER, samePlayer } from '@/lib/players'
import { applyTextImport, moveKey, orderToText, poolKey, reconcileOrder, rosterProgress } from '@/lib/draftBoard'
import { RosterProgressStrip } from './RosterProgressStrip'
import { picksUntil } from '@/lib/data/transform'
import { DraftPick, DraftSlot, NextPick, PoolPlayer } from '@/lib/types'

interface DraftFeed {
  season: number
  live: boolean
  picks: DraftPick[]
  pool: PoolPlayer[]
  order: DraftSlot[]
  rounds: number
  next: NextPick | null
}

interface Saved {
  manager?: string
  /** poolKey()s, best first — always reconciled against today's pool on load */
  order?: string[]
}

const STORAGE_PREFIX = 'plff-board-'

/**
 * A manager's private draft board: the league's Player Pool, dragged into
 * their own order, kept in this browser only. Rows cross out as picks land
 * on the league board.
 */
export function MyBoard() {
  const [feed, setFeed] = useState<DraftFeed | null>(null)
  const [error, setError] = useState('')
  const [manager, setManager] = useState('')
  const [order, setOrder] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hideDrafted, setHideDrafted] = useState(false)
  const [position, setPosition] = useState('')
  const [find, setFind] = useState('')
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/draft', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setFeed((await res.json()) as DraftFeed)
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

  // Restore this device's board, reconciled against today's pool
  useEffect(() => {
    if (!feed || loaded) return
    let saved: Saved = {}
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + feed.season) ?? '{}') as Saved
    } catch {
      // corrupt or unavailable storage: start from pool order
    }
    setManager(saved.manager ?? '')
    setOrder(reconcileOrder(saved.order ?? [], feed.pool))
    setLoaded(true)
  }, [feed, loaded])

  // A pool that grows mid-week still shows everyone
  useEffect(() => {
    if (feed && loaded) setOrder((o) => reconcileOrder(o, feed.pool))
  }, [feed, loaded])

  useEffect(() => {
    if (!feed || !loaded) return
    try {
      localStorage.setItem(STORAGE_PREFIX + feed.season, JSON.stringify({ manager, order } satisfies Saved))
    } catch {
      // private mode or storage full — the board still works for this visit
    }
  }, [feed, loaded, manager, order])

  const byKey = useMemo(() => new Map((feed?.pool ?? []).map((p) => [poolKey(p), p])), [feed])
  const rows = useMemo(
    () =>
      order
        .map((key, i) => {
          const p = byKey.get(key)
          if (!p) return null
          const pick = feed?.picks.find((d) => samePlayer(d, p))
          return { key, rank: i + 1, p, pick }
        })
        .filter((r): r is { key: string; rank: number; p: PoolPlayer; pick: DraftPick | undefined } => r !== null),
    [order, byKey, feed],
  )
  const remaining = rows.filter((r) => !r.pick)
  const q = find.trim().toLowerCase()

  // This manager's roster so far, against the draft minimums
  const myPicks = useMemo(
    () => (feed && manager ? feed.picks.filter((p) => p.team === manager).sort((a, b) => a.overall - b.overall) : []),
    [feed, manager],
  )
  const progress = useMemo(() => (feed && manager ? rosterProgress(myPicks, feed.rounds || undefined) : null), [feed, manager, myPicks])
  const [showRoster, setShowRoster] = useState(false)

  // Where this manager sits in the snake: 0 = on the clock
  const until = feed?.live && manager ? picksUntil(feed.next, feed.order ?? [], feed.rounds ?? 0, manager) : null
  useEffect(() => {
    // A background tab still shows the cue
    const base = 'My Draft Board'
    document.title = until === 0 ? `⏰ YOU'RE UP · ${base}` : until !== null && until <= 2 ? `${until} away · ${base}` : base
    return () => {
      document.title = base
    }
  }, [until])
  const visible = rows.filter(
    (r) =>
      (!hideDrafted || !r.pick) &&
      (!position || (r.p.position ?? '?') === position) &&
      (!q || r.p.player.toLowerCase().includes(q)),
  )

  const sensors = useSensors(
    // A small distance threshold so a tap on the handle doesn't start a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) setOrder((o) => moveKey(o, String(active.id), String(over.id)))
  }

  const copy = async () => {
    if (!feed) return
    try {
      await navigator.clipboard.writeText(orderToText(order, feed.pool))
      setNote('Copied — on your other device, open Import and paste.')
    } catch {
      setNote('Clipboard blocked — open Import, the list is there to select.')
      setImportText(orderToText(order, feed.pool))
      setImporting(true)
    }
  }
  const doImport = () => {
    if (!feed) return
    const { order: next, unmatched } = applyTextImport(order, importText, feed.pool)
    setOrder(next)
    setImporting(false)
    setImportText('')
    setNote(unmatched.length ? `Imported. Not in the pool, skipped: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '…' : ''}` : 'Imported.')
  }
  const reset = () => {
    if (!feed) return
    if (window.confirm('Reset your board to the league pool order? This can’t be undone.')) {
      setOrder(reconcileOrder([], feed.pool))
      setNote('Back to pool order.')
    }
  }

  if (!feed && !error) return <p className="py-16 text-center text-sm text-muted-foreground">Loading the league board…</p>
  if (feed && feed.pool.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        The league&apos;s Player Pool isn&apos;t loaded yet — the board fills in once the commish adds it to the sheet.
      </p>
    )
  }

  return (
    <div className="space-y-4">
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
        <span className="text-xs text-muted-foreground">your own picks show green instead of crossed out</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting((v) => !v)}>
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            Copy list
          </Button>
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      {importing && (
        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Paste a ranked list (one player per line, numbering optional) — from another site, or the <b>Copy list</b>{' '}
            output from your other device. Those players go to the top in that order; everyone else keeps their place
            below.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'1. Bijan Robinson\n2. Jahmyr Gibbs\n3. Ja\'Marr Chase\n…'}
            className="h-48 w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={doImport} disabled={!importText.trim()}>
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImporting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {feed?.live && feed.next && (
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 px-4 py-3 text-sm shadow-sm ${
            until === 0 ? 'animate-pulse border-[hsl(var(--win))] bg-[hsl(var(--win))]/10' : 'border-border bg-card'
          }`}
        >
          {until === 0 ? (
            <span className="text-lg font-extrabold text-win">You&apos;re on the clock — pick {feed.next.overall}</span>
          ) : (
            <>
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ownerColor(feed.next.team) }} />
                {feed.next.team} is on the clock
              </span>
              <span className="text-muted-foreground">
                Round {feed.next.round} · pick {feed.next.overall}
              </span>
              {until !== null && (
                <span className="ml-auto font-semibold">
                  You&apos;re up in {until} pick{until === 1 ? '' : 's'} (#{feed.next.overall + until})
                </span>
              )}
              {!manager && <span className="ml-auto text-muted-foreground">Pick your name to see when you&apos;re up</span>}
            </>
          )}
        </div>
      )}

      {progress && (
        <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your roster · {progress.picked} of {feed?.rounds ?? 20}
            </span>
            <button
              type="button"
              onClick={() => setShowRoster((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showRoster ? 'Hide picks' : 'Show picks'}
            </button>
          </div>
          <RosterProgressStrip progress={progress} />
          {showRoster && (
            <ul className="grid gap-x-4 gap-y-0.5 pt-1 text-sm sm:grid-cols-2">
              {myPicks.length === 0 && <li className="text-muted-foreground">No picks yet.</li>}
              {myPicks.map((p) => (
                <li key={p.overall} className="flex items-center gap-2">
                  <span className="tabular w-8 text-xs text-muted-foreground">R{p.round}</span>
                  <span
                    className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: positionColor(p.position) }}
                  >
                    {p.position ?? '—'}
                  </span>
                  <span className="truncate">{p.player}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(note || error) && (
        <p className={`text-sm ${error ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {error ? `⚠ ${error}` : note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md bg-secondary px-2 py-1 font-medium">
          {remaining.length} of {rows.length} left
        </span>
        {feed && (
          <span className="text-muted-foreground">
            {feed.live ? `Live · ${feed.picks.length} picks in` : feed.picks.length ? 'Draft complete' : 'Draft not started'}
          </span>
        )}
        {remaining.length > 0 && (
          <span className="hidden text-muted-foreground sm:inline">
            Next up: <b className="text-foreground">{remaining.slice(0, 3).map((r) => r.p.player).join(' · ')}</b>
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find…" className="h-8 w-32 text-xs" />
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Filter by position"
          >
            <option value="">All</option>
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <ol className="divide-y divide-border/40 rounded-xl border bg-card shadow-sm">
            {visible.map((r) => (
              <Row key={r.key} id={r.key} rank={r.rank} p={r.p} pick={r.pick} mine={Boolean(r.pick && manager && r.pick.team === manager)} />
            ))}
            {visible.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing in this view.</li>
            )}
          </ol>
        </SortableContext>
      </DndContext>

      <p className="text-xs text-muted-foreground">
        Drag the ≡ handle to reorder (or focus it and use the arrow keys). Saved in this browser only — nobody else,
        the commish included, can see it. Watching the{' '}
        <Link href="/draft" className="underline">
          league board
        </Link>
        {feed?.live ? ' — refreshes every 10 seconds while the draft is on.' : '.'}
      </p>
    </div>
  )
}

function Row({ id, rank, p, pick, mine }: { id: string; rank: number; p: PoolPlayer; pick?: DraftPick; mine: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const gone = pick && !mine
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2.5 bg-card px-2 py-1.5 text-sm ${isDragging ? 'relative z-10 shadow-lg' : ''} ${gone ? 'opacity-50' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${p.player}`}
        className="cursor-grab touch-none select-none rounded px-1.5 py-1 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
      >
        ≡
      </button>
      <span className="tabular w-7 shrink-0 text-right text-xs text-muted-foreground">{rank}</span>
      <span
        className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
        style={{ backgroundColor: positionColor(p.position) }}
      >
        {p.position ?? '—'}
      </span>
      <span className={`min-w-0 flex-1 truncate font-medium ${gone ? 'line-through' : ''} ${mine ? 'text-win' : ''}`}>{p.player}</span>
      {p.nflTeam && <span className="shrink-0 text-xs text-muted-foreground">{p.nflTeam}</span>}
      {pick && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ownerColor(pick.team) }} />
          {mine ? 'yours' : pick.team} · Rd {pick.round}
        </span>
      )}
    </li>
  )
}
