'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseDraftCell } from '@/lib/data/transform'
import { ownerColor } from '@/lib/league'
import { ambiguousNames, bestAvailable, cellRef, playerKey, positionColor } from '@/lib/players'
import { PositionLists } from '@/components/league/PositionLists'
import { RosterProgressStrip } from '@/components/league/RosterProgressStrip'
import { rosterProgress } from '@/lib/draftBoard'
import { DraftGrade, DraftState, PoolPlayer } from '@/lib/types'
import { DraftGradesForm } from '@/components/league/DraftGradesForm'
import { PlayerSearch } from '@/components/league/PlayerSearch'

/**
 * Draft-night control room. State lives in the sheet — every action rereads
 * it, so a page refresh, device swap, or mid-draft correction never loses
 * anything. Viewers follow along on /draft.
 */
export default function LiveDraftPage() {
  const [state, setState] = useState<(DraftState & { pool: PoolPlayer[]; grades: DraftGrade[] }) | null>(null)
  const [error, setError] = useState('')
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [player, setPlayer] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Traded pick the ledger doesn't know about: send the player to another column/round
  // Managers who left: the clock jumps their remaining picks (kept on this device)
  const [absent, setAbsent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('plff-draft-absent') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('plff-draft-absent', JSON.stringify(absent))
    } catch {
      // storage unavailable — the toggle still works for this visit
    }
  }, [absent])
  const [override, setOverride] = useState(false)
  const [toTeam, setToTeam] = useState('')
  const [toRound, setToRound] = useState<number | ''>('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/commish/draft${absent.length ? `?skip=${encodeURIComponent(absent.join(','))}` : ''}`)
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      setAuthed(true)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setState(data)
        setError('')
      } else {
        setError(data.error ?? 'Failed to load draft state')
      }
    } catch {
      setError('Network error — check the connection and reload')
    }
  }, [absent])

  useEffect(() => {
    load()
  }, [load])

  const preview = useMemo(() => (player.trim() ? parseDraftCell(player.trim()) : null), [player])
  // key -> team, so the typeahead greys out anyone already on a board column
  const ambiguous = useMemo(() => ambiguousNames(state?.pool ?? []), [state])
  const taken = useMemo(
    () => new Map((state?.picks ?? []).map((p) => [playerKey(p, ambiguous), p.team])),
    [state, ambiguous],
  )
  const takenBy = player.trim() ? taken.get(playerKey(cellRef(player), ambiguous)) : undefined
  const available = useMemo(
    () => (state?.pool.length ? bestAvailable(state.pool, new Set(taken.keys()), 4) : null),
    [state, taken],
  )
  const onClockProgress = useMemo(
    () => (state?.next ? rosterProgress(state.picks.filter((p) => p.team === state.next!.team), state.rounds) : null),
    [state],
  )

  const draftNow = () => {
    const body: Record<string, unknown> = { player }
    if (override && toTeam) body.team = toTeam
    if (override && toRound) body.round = toRound
    act(body, () => {
      setPlayer('')
      setOverride(false)
      setToTeam('')
      setToRound('')
    })
  }

  const act = async (body: object, after?: () => void) => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/commish/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        after?.()
        setNote(
          (data.undone
            ? `Undid: ${data.undone.player} (Rd ${data.undone.round})`
            : `Pick ${data.overall}: ${data.team} takes ${data.player}`) + (data.warning ? ` · ⚠ ${data.warning}` : ''),
        )
        await load()
      } else {
        setNote(data.error ?? 'Something went wrong')
      }
    } catch {
      setNote('Network error — the pick was NOT saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted-foreground">
          Sign in on the{' '}
          <Link href="/commish" className="font-medium text-primary underline">
            commissioner page
          </Link>{' '}
          first, then come back here for draft night.
        </p>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">
        {error ? (
          <p>
            {error}. The draft needs the Teams tab (DRAFT ORDER + TEAMS) and a Final Draft Board tab in the sheet.
          </p>
        ) : (
          'Loading…'
        )}
      </div>
    )
  }

  const total = state.rounds * state.order.length
  const recent = state.picks.slice(-5).reverse()

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Draft</h1>
          <p className="text-sm text-muted-foreground">
            {state.picks.length} of {total} picks in · everyone can follow along at{' '}
            <Link href="/draft" className="font-medium text-primary underline">
              /draft
            </Link>
          </p>
        </div>
        <Button variant="outline" onClick={() => act({ undo: true })} disabled={busy || state.picks.length === 0}>
          Undo last pick
        </Button>
      </div>

      {state.traded && state.traded.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Traded picks in the ledger:{' '}
          {state.traded
            .sort((a, b) => a[0] - b[0])
            .map(([overall, team]) => `#${overall} → ${team}`)
            .join(' · ')}
        </p>
      )}

      <details className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm" open={absent.length > 0}>
        <summary className="cursor-pointer select-none font-medium">
          Skip a manager&apos;s remaining picks
          {absent.length > 0 && <span className="ml-2 text-xs text-muted-foreground">— skipping {absent.join(', ')}</span>}
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Someone had to leave? Tick them and the clock jumps over their turns. Their empty cells stay listed below to
          fill in later.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state.order.map((o) => {
            const on = absent.includes(o.team)
            return (
              <button
                key={o.slot}
                type="button"
                onClick={() => setAbsent((prev) => (on ? prev.filter((t) => t !== o.team) : [...prev, o.team]))}
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  on ? 'border-amber-500 bg-amber-500/15 line-through' : 'bg-card hover:bg-secondary'
                }`}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ownerColor(o.team) }} />
                {o.team}
              </button>
            )
          })}
        </div>
      </details>

      {state.skipped && state.skipped.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">
            {state.skipped.length} skipped pick{state.skipped.length === 1 ? '' : 's'} still empty
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Click one to fill it.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {state.skipped.map((c) => (
              <button
                key={`${c.round}-${c.slot}`}
                type="button"
                onClick={() => {
                  setOverride(true)
                  setToTeam(c.team)
                  setToRound(c.round)
                }}
                className={`rounded-md border px-2 py-1 text-xs font-medium hover:bg-secondary ${
                  override && toTeam === c.team && toRound === c.round ? 'border-primary bg-secondary' : 'bg-card'
                }`}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ownerColor(c.team) }} />
                {c.team} · R{c.round} (#{c.overall})
              </button>
            ))}
          </div>
        </div>
      )}

      {state.next ? (
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>
              Round {state.next.round} · Pick {state.next.overall} overall
            </CardDescription>
            <CardTitle className="flex items-center gap-3 text-3xl">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-extrabold text-white"
                style={{ backgroundColor: ownerColor(state.next.team) }}
              >
                {state.next.team[0]}
              </span>
              {state.next.team} is on the clock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <PlayerSearch
                pool={state.pool}
                value={player}
                onChange={setPlayer}
                onEnter={() => player.trim() && !busy && !takenBy && draftNow()}
                taken={taken}
                placeholder={state.pool.length ? 'Start typing a name…' : 'Bijan Robinson ATL RB'}
                className="flex-1"
                autoFocus
              />
              <Button onClick={draftNow} disabled={!player.trim() || busy || Boolean(takenBy)}>
                {busy ? 'Saving…' : 'Draft'}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Goes to <b className="text-foreground">{state.next.team}</b>&apos;s column, round {state.next.round}.{' '}
              <button type="button" onClick={() => setOverride((v) => !v)} className="underline underline-offset-2 hover:text-foreground">
                {override ? 'Use the default' : 'Traded pick? Send it elsewhere'}
              </button>
            </div>
            {override && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Team (column)</span>
                  <select
                    value={toTeam}
                    onChange={(e) => setToTeam(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{state.next.team} (default)</option>
                    {state.order.map((o) => (
                      <option key={o.slot} value={o.team}>
                        {o.team}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Round</span>
                  <input
                    type="number"
                    min={1}
                    max={state.rounds}
                    value={toRound}
                    placeholder={String(state.next.round)}
                    onChange={(e) => setToRound(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
                <p className="flex-1 text-xs text-muted-foreground">
                  Better: log the swap in the trade form on /commish as &quot;Round 1, Pick 5&quot; ↔ &quot;Round 1, Pick
                  9&quot; — then the clock and the default column follow it on their own.
                </p>
              </div>
            )}
            {preview && takenBy && (
              <p className="text-sm font-medium text-loss">
                {preview.player} is already on {takenBy}&apos;s board. Two different players with that name? Add the
                NFL team (e.g. “{preview.player} LAC WR”).
              </p>
            )}
            {preview && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                Will record:
                <span className="font-semibold text-foreground">{preview.player}</span>
                {preview.position && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: positionColor(preview.position) }}
                  >
                    {preview.position}
                  </span>
                )}
                {preview.nflTeam && <span>{preview.nflTeam}</span>}
                {!preview.position && <span className="text-amber-600 dark:text-amber-400">— add position (e.g. “… ATL RB”)</span>}
              </p>
            )}
            {note && <p className="text-sm font-medium text-win">{note}</p>}
            {onClockProgress && (
              <div className="border-t pt-3">
                <RosterProgressStrip progress={onClockProgress} compact />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-xl font-bold">That&apos;s a wrap — the board is full. 🏈</p>
            {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
          </CardContent>
        </Card>
      )}

      {available && state.next && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-2 text-sm font-semibold">Best available</div>
          <PositionLists
            groups={available}
            limit={4}
            className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-3"
            item={(p) => (
              <button
                type="button"
                onClick={() => setPlayer([p.player, p.nflTeam, p.position].filter(Boolean).join(' '))}
                className="truncate text-left hover:underline"
              >
                {p.player}
              </button>
            )}
          />
        </div>
      )}

      {recent.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-semibold">
            <span>Last picks</span>
            <span className="text-xs font-normal text-muted-foreground">✕ removes that exact pick</span>
          </div>
          <ul className="divide-y divide-border/40 text-sm">
            {recent.map((p) => (
              <li key={`${p.round}-${p.slot}`} className="flex items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  aria-label={`Undo ${p.player}`}
                  title="Remove this pick"
                  disabled={busy}
                  onClick={() => window.confirm(`Remove ${p.player} from ${p.team}'s round ${p.round}?`) && act({ undo: true, round: p.round, slot: p.slot })}
                  className="text-xs text-muted-foreground hover:text-loss disabled:opacity-40"
                >
                  ✕
                </button>
                <span className="tabular w-8 text-xs text-muted-foreground">{p.overall}</span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ownerColor(p.team) }}
                />
                <span className="w-16 font-medium">{p.team}</span>
                <span className="flex-1 truncate">{p.player}</span>
                {p.position && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: positionColor(p.position) }}
                  >
                    {p.position}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DraftGradesForm order={state.order} picks={state.picks} initial={state.grades ?? []} />
    </div>
  )
}
