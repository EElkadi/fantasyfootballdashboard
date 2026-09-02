'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseDraftCell } from '@/lib/data/transform'
import { ownerColor } from '@/lib/league'
import { positionColor } from '@/lib/players'
import { DraftState } from '@/lib/types'

/**
 * Draft-night control room. State lives in the sheet — every action rereads
 * it, so a page refresh, device swap, or mid-draft correction never loses
 * anything. Viewers follow along on /draft.
 */
export default function LiveDraftPage() {
  const [state, setState] = useState<DraftState | null>(null)
  const [error, setError] = useState('')
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [player, setPlayer] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/commish/draft')
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const preview = useMemo(() => (player.trim() ? parseDraftCell(player.trim()) : null), [player])

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
              <Input
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && player.trim() && !busy && act({ player }, () => setPlayer(''))}
                placeholder="Bijan Robinson ATL RB"
                className="text-base"
                autoFocus
              />
              <Button onClick={() => act({ player }, () => setPlayer(''))} disabled={!player.trim() || busy}>
                {busy ? 'Saving…' : 'Draft'}
              </Button>
            </div>
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

      {recent.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-2 text-sm font-semibold">Last picks</div>
          <ul className="divide-y divide-border/40 text-sm">
            {recent.map((p) => (
              <li key={`${p.round}-${p.slot}`} className="flex items-center gap-3 px-4 py-2">
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
    </div>
  )
}
