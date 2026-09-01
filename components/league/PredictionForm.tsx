'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TeamMark } from './TeamMark'
import { BOLD_TAKE_MAX, LEAGUE } from '@/lib/league'

/**
 * Preseason ballot: rank all twelve, pick a champion and a Turd, add a bold
 * take. Up/down buttons rather than drag-and-drop — it has to work on a
 * phone in a group chat, and there's nothing to break.
 */
export function PredictionForm({ teams, submitted }: { teams: string[]; submitted: string[] }) {
  const [manager, setManager] = useState('')
  const [order, setOrder] = useState<string[]>(teams)
  const [champion, setChampion] = useState('')
  const [turd, setTurd] = useState('')
  const [boldTake, setBoldTake] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager, order, champion, turd, boldTake, passcode }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setDone(true)
      else setError(data.error ?? 'Something went wrong')
    } catch {
      setError('Network error — your ballot was NOT saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="font-semibold">Ballot in, {manager}. 🔒</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Picks stay hidden until kickoff. Changed your mind? Submit again before the lock and the new ballot replaces
          this one.
        </p>
      </div>
    )
  }

  const ready = manager && champion && turd && passcode
  const selectClass =
    'h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">I am</label>
        <select value={manager} onChange={(e) => setManager(e.target.value)} className={selectClass}>
          <option value="">— pick your name —</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
              {submitted.includes(t) ? ' (ballot in — resubmit replaces it)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold">Final regular-season order</h3>
        <p className="text-sm text-muted-foreground">Best team on top. Use the arrows.</p>
        <ol className="mt-3 divide-y rounded-lg border">
          {order.map((t, i) => (
            <li key={t} className="flex items-center gap-3 px-3 py-1.5">
              <span className="tabular w-6 text-right text-sm text-muted-foreground">{i + 1}</span>
              <TeamMark team={t} className="flex-1 pointer-events-none" />
              {i === LEAGUE.playoffTeams - 1 && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">last in</span>}
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${t} up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded-md border px-2 py-0.5 text-sm hover:bg-secondary disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${t} down`}
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  className="rounded-md border px-2 py-0.5 text-sm hover:bg-secondary disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          🏆 Champion
          <select value={champion} onChange={(e) => setChampion(e.target.value)} className={`${selectClass} block w-full`}>
            <option value="">— who wins it all —</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          💩 The Turd
          <select value={turd} onChange={(e) => setTurd(e.target.value)} className={`${selectClass} block w-full`}>
            <option value="">— who loses the Turd Bowl —</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Bold take <span className="font-normal text-muted-foreground">(optional, {BOLD_TAKE_MAX - boldTake.length} left)</span>
        <textarea
          value={boldTake}
          onChange={(e) => setBoldTake(e.target.value.slice(0, BOLD_TAKE_MAX))}
          placeholder="Greg misses the playoffs and blames the schedule."
          className="h-20 w-full rounded-md border border-input bg-background p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="password"
          placeholder="League passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="w-44"
        />
        <Button onClick={submit} disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Lock in my ballot'}
        </Button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  )
}
